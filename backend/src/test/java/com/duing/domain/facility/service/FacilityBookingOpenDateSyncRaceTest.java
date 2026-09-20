package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.repository.FacilityRepository;
import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 학교 목록 동기화와 총동연 오픈일 변경의 컬럼 경합을 실제 Postgres·Hibernate 더티 플러시로 고정한다(플랜 §4.3 T9).
 *
 * <p>동기화 트랜잭션은 시설을 로드한 뒤 커밋까지 시간이 걸리고, 그 사이에 커밋된 오픈일 변경은 동기화의 옛 스냅샷에
 * 없다. 전 컬럼 UPDATE 라면 늦게 커밋하는 동기화가 {@code booking_open_date} 를 로드 시점의 값(null)으로
 * 되돌린다 — {@code Facility} 의 {@code @DynamicUpdate} 가 변경 컬럼만 쓰게 해 이를 구조적으로 막는다.
 * 이 테스트에서 {@code @DynamicUpdate} 를 떼면 오픈일이 null 로 되돌아가 실패한다(음성 대조 확인 완료).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class FacilityBookingOpenDateSyncRaceTest extends IntegrationTestBase {

    @Autowired FacilityRepository facilityRepository;
    @Autowired FacilityAdminService facilityAdminService;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired Clock clock;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("동기화가 시설을 로드한 뒤 커밋되는 사이에 오픈일이 바뀌어도, 동기화 커밋이 오픈일을 되돌리지 않는다")
    void syncCommitDoesNotRevertConcurrentlyChangedOpenDate() throws Exception {
        Facility seeded = facilityRepository.save(Facility.create(
                (int) (sequence.getAndIncrement() % 1_000_000), "동기화전이름", "2105", 3));
        Long facilityId = seeded.getId();
        LocalDateTime updatedAtBeforeRace = seeded.getUpdatedAt();
        LocalDate newOpenDate = LocalDate.now(clock).plusDays(5);

        // 걸쇠 없이는 두 트랜잭션이 순차로 흘러 경합이 한 번도 만들어지지 않는다 —
        // 동기화의 "로드 완료" 와 관리자의 "커밋 완료" 사이를 정확히 교차시킨다.
        CountDownLatch loaded = new CountDownLatch(1);
        CountDownLatch patched = new CountDownLatch(1);
        ExecutorService syncThread = Executors.newSingleThreadExecutor();
        try {
            Future<?> syncTask = syncThread.submit(() -> transactionTemplate.executeWithoutResult(status -> {
                // FacilitySyncService.sync() 와 같은 로드(findAll)·같은 엔티티 메서드(updateDetails)를 밟는다.
                Facility persisted = facilityRepository.findAll().stream()
                        .filter(facility -> facilityId.equals(facility.getId()))
                        .findFirst().orElseThrow();
                loaded.countDown();
                awaitLatch(patched);
                persisted.updateDetails("새 이름", persisted.getLocation(), persisted.getSortOrder());
            }));

            assertThat(loaded.await(10, TimeUnit.SECONDS)).as("동기화 트랜잭션이 시설을 로드").isTrue();
            facilityAdminService.updateBookingOpenDate(
                    new UpdateFacilityBookingOpenDateCommand(facilityId, newOpenDate, null));
            patched.countDown();
            syncTask.get(10, TimeUnit.SECONDS);
        } finally {
            syncThread.shutdown();
            assertThat(syncThread.awaitTermination(10, TimeUnit.SECONDS)).as("동기화 스레드 종료").isTrue();
        }

        // 1차 캐시가 없는 새 트랜잭션에서 실제 행을 읽는다.
        Facility reloaded = transactionTemplate.execute(
                status -> facilityRepository.findById(facilityId).orElseThrow());
        assertThat(reloaded.getRoomName()).as("동기화의 이름 변경은 반영된다").isEqualTo("새 이름");
        assertThat(reloaded.getBookingOpenDate())
                .as("늦게 커밋한 동기화가 총동연이 설정한 오픈일을 되돌리면 안 된다").isEqualTo(newOpenDate);
        assertThat(reloaded.getUpdatedAt())
                .as("감사 컬럼은 부분 UPDATE 에서도 빠지지 않는다").isAfter(updatedAtBeforeRace);
    }

    private void awaitLatch(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("교차 걸쇠가 제한 시간 안에 열리지 않았다.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("교차 걸쇠 대기가 중단되었다.", interrupted);
        }
    }
}
