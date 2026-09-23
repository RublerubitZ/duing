package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * token_version 을 올리는 두 경로(전 기기 로그아웃·관리자 정지)가 같은 회원 행을 동시에 건드릴 때
 * 두 번의 bump 가 모두 살아남는지 검증한다 — 잠금 규약(bumpTokenVersion 은 반드시 FOR UPDATE 조회 뒤)의 회귀 감지기.
 *
 * <p>User 가 @DynamicUpdate(#1239) 로 바뀐 뒤 UpdateProfileConcurrencyTest·AdminUserNoteConcurrencyTest 는
 * 교차 컬럼 되돌림이 구조적으로 사라져 잠금 제거를 잡지 못한다. 반면 token_version 은 "읽고-올리는" 컬럼이라
 * 같은 컬럼끼리의 lost update 는 여전히 잠금만이 막는다. 정지의 status 는 @DynamicUpdate 덕에 어느 쪽이든
 * 살아남으므로, 이 테스트에서 잠금 제거를 드러내는 유일한 단언은 {@code tokenVersion == before + 2} 다.
 *
 * <p>잠금이 없으면 어느 방향이든 bump 하나를 잃는다(최종 before + 1).
 * <ul>
 *   <li>정지(changeStatus)가 무잠금이면: 정지 스레드는 즉시 옛 값(tv=0)을 읽고, UPDATE 는 로그아웃 트랜잭션의
 *       행잠금에 막혔다가 로그아웃 커밋(tv=1) 뒤에 자기 계산값 1 로 덮어쓴다 → 최종 1.</li>
 *   <li>로그아웃(logoutAll)이 무잠금이면: 로그아웃이 읽은 tv=0 에 +1 한 stale 값 1 이, 먼저 커밋된 정지(tv=1)
 *       뒤에 커밋되어 덮어쓴다 → 최종 1.</li>
 * </ul>
 *
 * <p>bumpTokenVersion 경로(현재 8곳): GeneralUserService.logout · logoutAll · forceLogout · changePassword ·
 * changePhone · resetPassword · withdraw · GeneralAdminUserCommandService.changeStatus.
 * 이 테스트는 잠금 규약을 logoutAll ↔ changeStatus 두 경로에서 실증한다. 나머지 경로의 규약은 각 메서드의
 * "행을 잠그고 조회한다" 주석이 지킨다 — 경로를 추가할 때 이 목록을 갱신한다.
 *
 * <p>경합 창을 확률에 맡기지 않기 위해 로그아웃 스레드는 서비스 호출을 테스트가 소유한 트랜잭션 안에서
 * 실행해(logoutAll 의 REQUIRED 전파가 합류한다) "행을 잠그고 bump 했지만 아직 커밋하지 않은" 지점에서 멈춘다.
 * changePassword 대신 logoutAll 을 쓰는 것은 UserFixture 의 비밀번호 해시가 BCrypt 가 아니어서다.
 *
 * <p>@DirtiesContext 는 두지 않는다 — IntegrationTestBase.cleanDatabase() 가 매 실행 전 DB 를 초기화한다
 * (UpdateProfileConcurrencyTest 와 동일 전제).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class TokenVersionLockRaceTest extends IntegrationTestBase {

    /**
     * 로그아웃 트랜잭션이 커밋을 미루는 시간. 잠금이 있으면 정지 스레드가 배타 잠금 대기로 소진하는 시간이고,
     * 잠금이 없으면 정지 스레드가 옛 값을 읽기에 충분한 시간이다.
     */
    private static final Duration COMMIT_DELAY_AFTER_SUSPEND_STARTED = Duration.ofMillis(500);
    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;

    @Autowired UserService userService;
    @Autowired AdminUserCommandService adminUserCommandService;
    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired TransactionTemplate transactionTemplate;

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("전 기기 로그아웃과 계정 정지가 동시에 들어와도 두 번의 token_version 증가가 모두 남는다")
    void concurrentLogoutAllAndSuspendKeepBothTokenVersionBumps() throws Exception {
        User admin = userRepository.saveAndFlush(UserFixture.admin());
        User target = userRepository.saveAndFlush(UserFixture.withName("경합대상"));
        int tokenVersionBeforeRace = target.getTokenVersion();

        ChangeUserStatusCommand suspendCommand = new ChangeUserStatusCommand(
                target.getId(), admin.getId(), UserStatus.SUSPENDED, "동시 경합 확인");

        CountDownLatch targetLockedByLogoutAll = new CountDownLatch(1);
        CountDownLatch suspendStarted = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        Future<Throwable> logoutAllOutcome = executor.submit(
                () -> runLogoutAllDelayingCommit(target.getId(), targetLockedByLogoutAll, suspendStarted));
        Future<Throwable> suspendOutcome = executor.submit(
                () -> runSuspendOnceLogoutAllLockedTarget(suspendCommand, targetLockedByLogoutAll, suspendStarted));

        assertThat(logoutAllOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("행잠금은 두 조치를 줄 세울 뿐 어느 쪽도 실패시키지 않는다").isNull();
        assertThat(suspendOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("정지는 잠금 해제를 기다렸다가 성공해야 한다").isNull();

        User afterBothCommits = userRepository.findById(target.getId()).orElseThrow();
        // 핵심 불변식(유일한 잠금 제거 감지기): 두 bump 중 하나라도 유실되면 무효화된 줄 알았던 토큰이 살아 있다.
        assertThat(afterBothCommits.getTokenVersion())
                .as("로그아웃과 정지가 각각 올린 token_version 이 모두 남아야 한다")
                .isEqualTo(tokenVersionBeforeRace + 2);
        assertThat(afterBothCommits.getStatus()).isEqualTo(UserStatus.SUSPENDED);
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactly(AdminUserAction.ACCOUNT_SUSPENDED);
    }

    /**
     * 전 기기 로그아웃을 테스트 소유 트랜잭션 안에서 실행해, 회원 행을 잠그고 bump 한 뒤 커밋 이전 지점에서 멈춘다.
     */
    private Throwable runLogoutAllDelayingCommit(Long targetUserId,
                                                 CountDownLatch targetLockedByLogoutAll,
                                                 CountDownLatch suspendStarted) {
        try {
            transactionTemplate.executeWithoutResult(transactionStatus -> {
                userService.logoutAll(targetUserId);
                targetLockedByLogoutAll.countDown();
                awaitOrThrow(suspendStarted);
                sleepQuietly(COMMIT_DELAY_AFTER_SUSPEND_STARTED);
            });
            return null;
        } catch (Throwable logoutAllFailure) {
            return logoutAllFailure;
        }
    }

    private Throwable runSuspendOnceLogoutAllLockedTarget(ChangeUserStatusCommand suspendCommand,
                                                          CountDownLatch targetLockedByLogoutAll,
                                                          CountDownLatch suspendStarted) {
        try {
            awaitOrThrow(targetLockedByLogoutAll);
            // 잠금이 살아 있으면 아래 호출은 로그아웃 트랜잭션이 커밋할 때까지 막힌다.
            // 래치를 먼저 내려야 로그아웃 스레드가 커밋으로 나아가고, 서로를 기다리는 교착이 생기지 않는다.
            suspendStarted.countDown();
            adminUserCommandService.changeStatus(suspendCommand);
            return null;
        } catch (Throwable suspendFailure) {
            return suspendFailure;
        }
    }

    private static void awaitOrThrow(CountDownLatch latch) {
        try {
            if (!latch.await(LATCH_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                throw new IllegalStateException("동시성 테스트 래치가 시간 내에 열리지 않았습니다.");
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시성 테스트 래치 대기가 중단되었습니다.", interrupted);
        }
    }

    private static void sleepQuietly(Duration duration) {
        try {
            Thread.sleep(duration.toMillis());
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("동시성 테스트 커밋 지연이 중단되었습니다.", interrupted);
        }
    }
}
