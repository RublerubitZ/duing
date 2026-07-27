package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.UpdateProfileCommand;
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
 * 회원 본인의 프로필 수정과 관리자의 계정 정지가 같은 회원 행을 동시에 건드릴 때의 직렬화를 검증한다.
 *
 * <p>User 에는 @Version 도 @DynamicUpdate 도 없어 더티 플러시가 모든 컬럼을 쓰는 UPDATE 를 낸다.
 * 프로필 수정이 행을 잠그지 않고 읽으면, 읽은 뒤 커밋된 정지(status·token_version)까지 옛 스냅샷 값으로
 * 되돌려 쓴다. 그러면 계정이 정지에서 풀리고 토큰 무효화도 함께 되돌아가 이미 발급된 액세스 토큰이
 * 되살아나는데, 감사 로그에는 "정지했다"만 남아 이력이 사실과 달라진다.
 *
 * <p>정지된 회원이 이 경로를 반복해 스스로 정지를 푸는 것은 아니다 — JwtAuthenticationFilter 가
 * isActive() 로 정지 계정의 새 요청을 이미 막는다. 위험한 것은 정지가 커밋되기 직전에 이미 진입해
 * 회원 행을 읽어둔 요청이다. 즉 한 번 어긋나면 조용히 틀린 상태로 남고, 되돌릴 계기도 없다.
 *
 * <p>경합 창을 확률에 맡기지 않기 위해 프로필 스레드는 서비스 호출을 테스트가 소유한 트랜잭션 안에서
 * 실행한다(updateProfile 의 REQUIRED 전파가 합류한다). 그러면 "회원 행을 이미 읽었지만 아직 커밋하지
 * 않은" 지점에서 스레드를 멈춰 세울 수 있고, 그 순간 정지 스레드를 출발시키면 운영 코드가 실제로 겪는
 * 순서(프로필이 회원을 읽음 → 정지가 커밋됨 → 프로필이 커밋됨)를 매번 동일하게 만들 수 있다.
 *
 * <p>행잠금이 있으면 정지 스레드는 프로필 트랜잭션이 커밋할 때까지 잠금 대기에 묶여, 커밋 지연 시간을
 * 그대로 소진한 뒤 최신 값을 다시 읽고 정지한다. 잠금이 없으면 정지가 먼저 커밋되고 뒤이어 커밋되는
 * 프로필 수정이 그 정지를 덮어쓴다 — 즉 findByIdForUpdate 를 findById 로 되돌리면 이 테스트는 실패한다.
 *
 * <p>@DirtiesContext 는 두지 않는다 — IntegrationTestBase.cleanDatabase() 가 매 실행 전 DB 를
 * 초기화하고, 동시성 테스트는 별도 트랜잭션에서 동작하므로 truncate 전략을 쓴다
 * (AdminUserNoteConcurrencyTest 와 동일 전제).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UpdateProfileConcurrencyTest extends IntegrationTestBase {

    /**
     * 프로필 트랜잭션이 커밋을 미루는 시간. 잠금이 없으면 정지 스레드가 정지를 커밋하기에 충분하고,
     * 잠금이 있으면 정지 스레드가 배타 잠금 대기로 소진하는 시간이다.
     */
    private static final Duration COMMIT_DELAY_AFTER_SUSPEND_STARTED = Duration.ofMillis(500);
    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;
    private static final String UPDATED_NAME = "수정된이름";
    private static final Grade UPDATED_GRADE = Grade.SENIOR;
    private static final String UPDATED_MAJOR = "전자공학";

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
    @DisplayName("프로필 수정과 계정 정지가 동시에 들어와도 프로필 수정이 정지를 되돌리지 않는다")
    void concurrentProfileUpdateNeverRevertsCommittedSuspension() throws Exception {
        User admin = userRepository.saveAndFlush(UserFixture.admin());
        User target = userRepository.saveAndFlush(UserFixture.withName("경합대상"));
        int tokenVersionBeforeSuspend = target.getTokenVersion();

        UpdateProfileCommand profileCommand = new UpdateProfileCommand(
                target.getId(), UPDATED_NAME, Grade.SENIOR, College.IT_ENGINEERING, UPDATED_MAJOR);
        ChangeUserStatusCommand suspendCommand = new ChangeUserStatusCommand(
                target.getId(), admin.getId(), UserStatus.SUSPENDED, "동시 경합 확인");

        CountDownLatch targetLoadedByProfile = new CountDownLatch(1);
        CountDownLatch suspendStarted = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        Future<Throwable> profileOutcome = executor.submit(
                () -> runProfileUpdateDelayingCommit(profileCommand, targetLoadedByProfile, suspendStarted));
        Future<Throwable> suspendOutcome = executor.submit(
                () -> runSuspendOnceProfileLoadedTarget(suspendCommand, targetLoadedByProfile, suspendStarted));

        assertThat(profileOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("행잠금은 두 조치를 줄 세울 뿐 어느 쪽도 실패시키지 않는다").isNull();
        assertThat(suspendOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("정지는 잠금 해제를 기다렸다가 성공해야 한다").isNull();

        User afterBothCommits = userRepository.findById(target.getId()).orElseThrow();
        // 핵심 불변식: 감사 로그가 "정지했다" 고 말하면 계정은 실제로 정지되어 있어야 한다.
        assertThat(afterBothCommits.getStatus())
                .as("나중에 커밋되는 프로필 수정이 이미 커밋된 정지를 되돌려서는 안 된다")
                .isEqualTo(UserStatus.SUSPENDED);
        // status 만 보면 정지 집행의 절반(토큰 무효화)이 되돌아간 것을 놓친다 — 정지 계정의 옛 액세스 토큰이 되살아난다.
        assertThat(afterBothCommits.getTokenVersion())
                .as("정지가 올린 token_version 도 함께 살아남아야 한다")
                .isEqualTo(tokenVersionBeforeSuspend + 1);
        // 잠금이 직렬화만 하고 어느 쪽 결과도 잃지 않는다는 확인 — 프로필 수정이 유실되면 그것도 회귀다.
        assertThat(afterBothCommits.getName()).isEqualTo(UPDATED_NAME);
        assertThat(afterBothCommits.getGrade()).isEqualTo(UPDATED_GRADE);
        assertThat(afterBothCommits.getMajor()).isEqualTo(UPDATED_MAJOR);
        // 위 불변식의 나머지 절반 — 감사 로그가 실제로 "정지했다" 고 말하고 있어야 대조가 성립한다.
        // 프로필 수정은 조치가 아니라 감사 대상이 아니므로 정지 한 건만 남는 것이 정상이다.
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactly(AdminUserAction.ACCOUNT_SUSPENDED);
    }

    /**
     * 프로필 수정을 테스트 소유 트랜잭션 안에서 실행해, 회원 행을 읽은 뒤 커밋 이전 지점에서 멈춘다.
     * 정지 스레드가 출발한 뒤에야 커밋하므로 운영 코드의 경합 창이 매번 동일하게 열린다.
     */
    private Throwable runProfileUpdateDelayingCommit(UpdateProfileCommand profileCommand,
                                                     CountDownLatch targetLoadedByProfile,
                                                     CountDownLatch suspendStarted) {
        try {
            transactionTemplate.executeWithoutResult(transactionStatus -> {
                userService.updateProfile(profileCommand);
                targetLoadedByProfile.countDown();
                awaitOrThrow(suspendStarted);
                sleepQuietly(COMMIT_DELAY_AFTER_SUSPEND_STARTED);
            });
            return null;
        } catch (Throwable profileFailure) {
            return profileFailure;
        }
    }

    private Throwable runSuspendOnceProfileLoadedTarget(ChangeUserStatusCommand suspendCommand,
                                                        CountDownLatch targetLoadedByProfile,
                                                        CountDownLatch suspendStarted) {
        try {
            awaitOrThrow(targetLoadedByProfile);
            // 잠금이 살아 있으면 아래 호출은 프로필 트랜잭션이 커밋할 때까지 막힌다.
            // 래치를 먼저 내려야 프로필 스레드가 커밋으로 나아가고, 서로를 기다리는 교착이 생기지 않는다.
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
