package com.duing.global.frontend;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.ClubFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.ClubClosureService;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.frontend.event.ClubPublicPageChangedEvent;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 동아리 상세 재생성(#1356)의 end-to-end 계약 — 발행 지점 → AFTER_COMMIT → 전용 실행기 @Async 리스너 → 요청기.
 * 요청기만 목으로 바꿔 "어느 경로를 어떤 메서드로 요청했는지" 를 고정한다. 리스너는 별도 스레드라 verify(timeout)/after 로
 * 기다리고, 앞 테스트의 늦은 호출이 섞이지 않게 각 테스트 시작 때 실행기를 비운 뒤 호출 기록을 지운다
 * (OpsSlackMonitoringIntegrationTest 전례).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubPublicPageRevalidationIntegrationTest extends IntegrationTestBase {

    private static final long ASYNC_WAIT_MS = 3_000;
    private static final long QUIET_WAIT_MS = 700;

    @MockitoBean FrontendRevalidator frontendRevalidator;

    @Autowired ApplicationEventPublisher eventPublisher;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired @Qualifier(FrontendRevalidationAsyncConfig.EXECUTOR_BEAN_NAME)
    ThreadPoolTaskExecutor frontendRevalidationTaskExecutor;

    @BeforeEach
    void setUp() throws InterruptedException {
        drainRevalidationExecutor();
        clearInvocations(frontendRevalidator);
    }

    /** 앞 테스트가 남긴 비동기 요청이 끝날 때까지(활성 0·큐 비움) 최대 3초 기다린다. */
    private void drainRevalidationExecutor() throws InterruptedException {
        long deadline = System.currentTimeMillis() + ASYNC_WAIT_MS;
        while ((frontendRevalidationTaskExecutor.getActiveCount() > 0
                || frontendRevalidationTaskExecutor.getQueueSize() > 0)
                && System.currentTimeMillis() < deadline) {
            Thread.sleep(20);
        }
    }

    private static String detailPathOf(Club club) {
        return "/clubs/" + club.getId();
    }

    @Test
    @DisplayName("상세 변경 이벤트가 커밋되면 전용 실행기 스레드에서 그 동아리 상세 재생성을 집계 없이 요청한다")
    void committedChangeRequestsDetailRevalidationOnDedicatedThread() throws Exception {
        CompletableFuture<String> callingThreadName = new CompletableFuture<>();
        doAnswer(invocation -> callingThreadName.complete(Thread.currentThread().getName()))
                .when(frontendRevalidator).revalidateWithoutAlert(anyString());

        transactionTemplate.executeWithoutResult(transactionStatus ->
                eventPublisher.publishEvent(new ClubPublicPageChangedEvent(7L)));

        assertThat(callingThreadName.get(ASYNC_WAIT_MS, TimeUnit.MILLISECONDS)).startsWith("frontend-revalidate-");
        verify(frontendRevalidator).revalidateWithoutAlert("/clubs/7");
        verify(frontendRevalidator, never()).revalidate(anyString());
    }

    @Test
    @DisplayName("이벤트를 발행한 트랜잭션이 롤백되면 재생성을 요청하지 않는다(AFTER_COMMIT)")
    void rolledBackChangeDoesNotRequest() {
        transactionTemplate.executeWithoutResult(transactionStatus -> {
            eventPublisher.publishEvent(new ClubPublicPageChangedEvent(7L));
            transactionStatus.setRollbackOnly();
        });

        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    // setRollbackOnly() 롤백은 beforeCommit 을 아예 부르지 않아 BEFORE_COMMIT 리스너도 안 불린다 — phase 를 고정하려면
    // 커밋 직전 단계에서 실패시킨다. 리스너 동기화가 먼저 등록되므로 BEFORE_COMMIT 이었다면 요청이 이미 나간다.
    @Test
    @DisplayName("커밋 직전 단계에서 실패해 롤백되면 재생성을 요청하지 않는다 — 커밋 전 발행이었다면 이미 나갔다")
    void failureBeforeCommitDoesNotRequest() {
        assertThatThrownBy(() -> transactionTemplate.executeWithoutResult(transactionStatus -> {
            eventPublisher.publishEvent(new ClubPublicPageChangedEvent(7L));
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void beforeCommit(boolean readOnly) {
                    throw new IllegalStateException("커밋 직전 실패");
                }
            });
        })).isInstanceOf(IllegalStateException.class);

        verify(frontendRevalidator, after(QUIET_WAIT_MS).never()).revalidateWithoutAlert(anyString());
    }

    @Test
    @DisplayName("상태 전이(승인·운영중단)와 폐쇄는 기존 운영 이벤트로 그 동아리 상세 재생성을 각각 요청하고, 목록(/clubs)은 부르지 않는다")
    void statusChangesAndClosureRequestDetailRevalidation() {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = clubRepository.save(ClubFixture.academic("상세재생성상태동아리"));
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.ACTIVE, null, admin.getId()));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS)).revalidateWithoutAlert(detailPathOf(club));

        clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.INACTIVE, null, admin.getId()));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(2)).revalidateWithoutAlert(detailPathOf(club));

        clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "해체"));
        verify(frontendRevalidator, timeout(ASYNC_WAIT_MS).times(3)).revalidateWithoutAlert(detailPathOf(club));
        verify(frontendRevalidator, never()).revalidate(anyString());
        verify(frontendRevalidator, never()).revalidateWithoutAlert("/clubs");
    }
}
