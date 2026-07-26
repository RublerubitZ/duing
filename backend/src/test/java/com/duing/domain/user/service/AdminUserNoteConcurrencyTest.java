package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.user.entity.AdminUserAction;
import com.duing.domain.user.entity.AdminUserActionLog;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.entity.UserStatus;
import com.duing.domain.user.repository.AdminUserActionLogRepository;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
import com.duing.domain.user.service.dto.command.UpdateAdminNoteCommand;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 관리자 메모 저장과 계정 정지가 같은 회원 행을 동시에 건드릴 때의 직렬화를 검증한다.
 *
 * <p>User 에는 @Version 도 @DynamicUpdate 도 없어 더티 플러시가 모든 컬럼을 쓰는 UPDATE 를 낸다.
 * 메모 저장이 행을 잠그지 않고 읽으면, 읽은 뒤 커밋된 정지(status·token_version)까지 옛 스냅샷 값으로
 * 되돌려 쓴다. 그러면 계정은 멀쩡히 살아 있는데 감사 로그에는 "정지했다"만 남아 이력이 거짓말을 한다.
 *
 * <p>경합 창을 확률에 맡기지 않기 위해, 메모 스레드는 서비스 호출을 테스트가 소유한 트랜잭션 안에서
 * 실행한다(updateAdminNote 의 REQUIRED 전파가 합류한다). 그러면 "회원 행을 이미 읽었지만 아직
 * 커밋하지 않은" 지점에서 스레드를 멈춰 세울 수 있고, 그 순간 정지 스레드를 출발시키면 운영 코드가
 * 실제로 겪는 순서(메모가 회원을 읽음 → 정지가 커밋됨 → 메모가 커밋됨)를 매번 동일하게 만들 수 있다.
 *
 * <p>행잠금이 있으면 정지 스레드는 메모 트랜잭션이 커밋할 때까지 잠금 대기에 묶여, 커밋 지연 시간을
 * 그대로 소진한 뒤 최신 값을 다시 읽고 정지한다. 잠금이 없으면 정지가 먼저 커밋되고 뒤이어 커밋되는
 * 메모가 그 정지를 덮어쓴다 — 즉 findByIdForUpdate 를 findById 로 되돌리면 이 테스트는 실패한다.
 *
 * <p>@DirtiesContext 는 두지 않는다 — IntegrationTestBase.cleanDatabase() 가 매 실행 전 DB 를
 * 초기화하고, 동시성 테스트는 별도 트랜잭션에서 동작하므로 truncate 전략을 쓴다
 * (ApplicationSubmitQuestionChangeConcurrencyTest 와 동일 전제).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminUserNoteConcurrencyTest extends IntegrationTestBase {

    /**
     * 메모 트랜잭션이 커밋을 미루는 시간. 잠금이 없으면 정지 스레드가 정지를 커밋하기에 충분하고,
     * 잠금이 있으면 정지 스레드가 배타 잠금 대기로 소진하는 시간이다.
     */
    private static final Duration COMMIT_DELAY_AFTER_SUSPEND_STARTED = Duration.ofMillis(500);
    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;
    private static final String NOTE = "운영 확인 필요";

    @Autowired AdminUserCommandService adminUserCommandService;
    @Autowired UserRepository userRepository;
    @Autowired AdminUserActionLogRepository actionLogRepository;
    @Autowired TransactionTemplate transactionTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());
    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("메모 저장과 계정 정지가 동시에 들어와도 메모가 정지를 되돌리지 않는다")
    void concurrentNoteSaveNeverRevertsCommittedSuspension() throws Exception {
        User admin = saveUser("총동연관리자", UserRole.ADMIN);
        User target = saveUser("경합대상", UserRole.STUDENT);
        int tokenVersionBeforeSuspend = target.getTokenVersion();

        UpdateAdminNoteCommand noteCommand = new UpdateAdminNoteCommand(target.getId(), admin.getId(), NOTE);
        ChangeUserStatusCommand suspendCommand = new ChangeUserStatusCommand(
                target.getId(), admin.getId(), UserStatus.SUSPENDED, "동시 경합 확인");

        CountDownLatch targetLoadedByNote = new CountDownLatch(1);
        CountDownLatch suspendStarted = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        Future<Throwable> noteOutcome = executor.submit(
                () -> runNoteUpdateDelayingCommit(noteCommand, targetLoadedByNote, suspendStarted));
        Future<Throwable> suspendOutcome = executor.submit(
                () -> runSuspendOnceNoteLoadedTarget(suspendCommand, targetLoadedByNote, suspendStarted));

        assertThat(noteOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("행잠금은 두 조치를 줄 세울 뿐 어느 쪽도 실패시키지 않는다").isNull();
        assertThat(suspendOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("정지는 잠금 해제를 기다렸다가 성공해야 한다").isNull();

        User afterBothCommits = userRepository.findById(target.getId()).orElseThrow();
        // 핵심 불변식: 감사 로그가 "정지했다" 고 말하면 계정은 실제로 정지되어 있어야 한다.
        assertThat(afterBothCommits.getStatus())
                .as("나중에 커밋되는 메모 저장이 이미 커밋된 정지를 되돌려서는 안 된다")
                .isEqualTo(UserStatus.SUSPENDED);
        // status 만 보면 정지 집행의 절반(토큰 무효화)이 되돌아간 것을 놓친다 — 정지 계정의 옛 액세스 토큰이 되살아난다.
        assertThat(afterBothCommits.getTokenVersion())
                .as("정지가 올린 token_version 도 함께 살아남아야 한다")
                .isEqualTo(tokenVersionBeforeSuspend + 1);
        // 잠금이 직렬화만 하고 어느 쪽 결과도 잃지 않는다는 확인 — 메모가 유실되면 그것도 회귀다.
        assertThat(afterBothCommits.getAdminNote()).isEqualTo(NOTE);
        assertThat(actionLogRepository.findAll())
                .extracting(AdminUserActionLog::getAction)
                .containsExactlyInAnyOrder(
                        AdminUserAction.ADMIN_NOTE_UPDATED, AdminUserAction.ACCOUNT_SUSPENDED);
    }

    /**
     * 메모 저장을 테스트 소유 트랜잭션 안에서 실행해, 회원 행을 읽은 뒤 커밋 이전 지점에서 멈춘다.
     * 정지 스레드가 출발한 뒤에야 커밋하므로 운영 코드의 경합 창이 매번 동일하게 열린다.
     */
    private Throwable runNoteUpdateDelayingCommit(UpdateAdminNoteCommand noteCommand,
                                                  CountDownLatch targetLoadedByNote,
                                                  CountDownLatch suspendStarted) {
        try {
            transactionTemplate.executeWithoutResult(transactionStatus -> {
                adminUserCommandService.updateAdminNote(noteCommand);
                targetLoadedByNote.countDown();
                awaitOrThrow(suspendStarted);
                sleepQuietly(COMMIT_DELAY_AFTER_SUSPEND_STARTED);
            });
            return null;
        } catch (Throwable noteFailure) {
            return noteFailure;
        }
    }

    private Throwable runSuspendOnceNoteLoadedTarget(ChangeUserStatusCommand suspendCommand,
                                                     CountDownLatch targetLoadedByNote,
                                                     CountDownLatch suspendStarted) {
        try {
            awaitOrThrow(targetLoadedByNote);
            // 잠금이 살아 있으면 아래 호출은 메모 트랜잭션이 커밋할 때까지 막힌다.
            // 래치를 먼저 내려야 메모 스레드가 커밋으로 나아가고, 서로를 기다리는 교착이 생기지 않는다.
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

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.saveAndFlush(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name, "hashed", role, Grade.JUNIOR, College.IT_ENGINEERING, "컴퓨터공학",
                "010-" + String.format("%04d", unique % 10000) + "-0000",
                LocalDateTime.now()));
    }
}
