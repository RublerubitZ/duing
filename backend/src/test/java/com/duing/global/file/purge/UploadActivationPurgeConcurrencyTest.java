package com.duing.global.file.purge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.global.file.FileStorageService;
import com.duing.global.file.UploadedObjectService;
import com.duing.global.file.controller.dto.FilePurpose;
import com.duing.global.file.entity.UploadedObject;
import com.duing.global.file.entity.UploadedObjectStatus;
import com.duing.global.file.exception.FileException;
import com.duing.global.file.repository.UploadedObjectRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 활성화(attach) ↔ 파기 잡 claim 경쟁(스펙 §0-5·§4.1). 두 스레드를 latch 로 동시에 시작시키고 순서 무관 불변식을
 * 단언한다(ClubHeroActivityPhotoDeleteConcurrencyTest 전례). 활성화 스레드는 도메인 서비스처럼 TransactionTemplate
 * 안에서 활성화한다 — 잠금이 커밋까지 유지되는 실제 조건을 재현하기 위해서다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UploadActivationPurgeConcurrencyTest extends IntegrationTestBase {

    private static final String STUB_PREFIX = "/files/stub/";

    @Autowired UploadedObjectService uploadedObjectService;
    @Autowired UploadedObjectRepository uploadedObjectRepository;
    @Autowired Clock clock;
    @Autowired PlatformTransactionManager platformTransactionManager;
    @MockitoBean FileStorageService fileStorageService;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    private void stubStorage() {
        // @MockitoBean 이 StubFileStorageService 를 대체하므로 toStorageKey/toFileUrl 대칭을 직접 준다.
        when(fileStorageService.toStorageKey(anyString())).thenAnswer(invocation -> {
            String url = invocation.getArgument(0, String.class);
            return url.startsWith(STUB_PREFIX) ? url.substring(STUB_PREFIX.length()) : null;
        });
        when(fileStorageService.toFileUrl(anyString()))
                .thenAnswer(invocation -> STUB_PREFIX + invocation.getArgument(0, String.class));
        when(fileStorageService.delete(anyString())).thenReturn(true);
    }

    private UploadPurgeJob deleteEnabledJob() {
        return new UploadPurgeJob(new UploadPurgeProperties(true, true, Duration.ofHours(24)),
                clock, uploadedObjectRepository, fileStorageService, platformTransactionManager);
    }

    private String seedExpiredPending() {
        String storageKey = "club/logo/" + sequence.incrementAndGet() + ".jpg";
        uploadedObjectRepository.save(UploadedObject.pending(storageKey, FilePurpose.LOGO, 1L,
                Instant.now(clock).minus(25, ChronoUnit.HOURS)));
        return storageKey;
    }

    private UploadedObjectStatus statusOf(String storageKey) {
        return uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow().getStatus();
    }

    @RepeatedTest(10)
    @DisplayName("25시간 지난 PENDING 에 활성화와 파기 잡이 동시에 달려들어도 '삭제된 객체를 가리키는 ACTIVE' 는 생기지 않는다")
    void activationVersusPurgeNeverLeavesActiveOnDeletedObject() throws Exception {
        stubStorage();
        String storageKey = seedExpiredPending();
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        List<Throwable> failures = runConcurrently(
                () -> transactionTemplate.executeWithoutResult(status ->
                        uploadedObjectService.activate(STUB_PREFIX + storageKey)),
                () -> deleteEnabledJob().run());

        UploadedObjectStatus finalStatus = statusOf(storageKey);
        if (finalStatus == UploadedObjectStatus.ACTIVE) {
            // 활성화가 이겼다 — 잡은 claim 에서 ACTIVE 를 보고 건너뛰어야 하며 스토리지는 손대지 않는다.
            assertThat(failures).isEmpty();
            verify(fileStorageService, never()).delete(anyString());
        } else {
            // 잡이 이겼다 — 활성화는 PURGING/PURGED 를 보고 만료 예외로 실패해야 한다.
            assertThat(finalStatus).isEqualTo(UploadedObjectStatus.PURGED);
            assertThat(failures).hasSize(1);
            assertThat(failures.get(0)).isInstanceOf(FileException.UploadExpiredException.class);
            verify(fileStorageService, times(1)).delete(anyString());
        }
    }

    @Test
    @DisplayName("잡이 먼저 claim(PURGING)한 업로드를 뒤늦게 연결하면 만료 예외가 나고 상태는 그대로다")
    void activationAfterClaimFails() {
        stubStorage();
        String storageKey = seedExpiredPending();
        UploadedObject claimed = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        claimed.markPurging();
        uploadedObjectRepository.save(claimed);

        assertThatThrownBy(() -> uploadedObjectService.activate(STUB_PREFIX + storageKey))
                .isInstanceOf(FileException.UploadExpiredException.class);
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PURGING);
    }

    @Test
    @DisplayName("잡이 먼저 claim(PURGING)한 업로드에 활성화와 실제 잡이 동시에 달려들면 잡이 삭제를 확정하고 활성화는 만료로 실패한다")
    void purgeWinsWhenJobAlreadyClaimed() throws Exception {
        stubStorage();
        String storageKey = seedExpiredPending();
        UploadedObject claimed = uploadedObjectRepository.findByStorageKey(storageKey).orElseThrow();
        claimed.markPurging(); // 이전 실행이 claim 만 하고 삭제를 확정하지 못한 상태를 재현한다
        uploadedObjectRepository.save(claimed);
        TransactionTemplate transactionTemplate = new TransactionTemplate(platformTransactionManager);

        List<Throwable> failures = runConcurrently(
                () -> transactionTemplate.executeWithoutResult(status ->
                        uploadedObjectService.activate(STUB_PREFIX + storageKey)),
                () -> deleteEnabledJob().run());

        // PURGING 은 활성화 불가·잡의 재claim 대상 — 순서와 무관하게 잡이 이긴다.
        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.PURGED);
        assertThat(failures).hasSize(1);
        assertThat(failures.get(0)).isInstanceOf(FileException.UploadExpiredException.class);
        verify(fileStorageService, times(1)).delete(anyString());
    }

    @Test
    @DisplayName("먼저 연결(ACTIVE)된 업로드는 25시간이 지났어도 잡이 건드리지 않는다")
    void purgeSkipsAlreadyActivated() {
        stubStorage();
        String storageKey = seedExpiredPending();
        uploadedObjectService.activate(STUB_PREFIX + storageKey);

        deleteEnabledJob().run();

        assertThat(statusOf(storageKey)).isEqualTo(UploadedObjectStatus.ACTIVE);
        verify(fileStorageService, never()).delete(anyString());
    }

    private List<Throwable> runConcurrently(Runnable firstTask, Runnable secondTask) throws InterruptedException {
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch done = new CountDownLatch(2);
        List<Throwable> failures = new CopyOnWriteArrayList<>();
        executor = Executors.newFixedThreadPool(2);
        for (Runnable task : List.of(firstTask, secondTask)) {
            executor.submit(() -> {
                try {
                    start.await();
                    task.run();
                } catch (Throwable failure) {
                    failures.add(failure);
                } finally {
                    done.countDown();
                }
            });
        }
        start.countDown();
        // 교착이 생기면 이 대기가 끝나지 않는다 — uploaded_object 단일 행 잠금 규칙의 회귀 감시 지점.
        assertThat(done.await(15, TimeUnit.SECONDS)).as("두 트랜잭션이 교착 없이 완료").isTrue();
        return failures;
    }
}
