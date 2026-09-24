package com.duing.domain.user.entity;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.AdminUserCommandService;
import com.duing.domain.user.service.dto.command.ChangeUserStatusCommand;
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
 * User 의 @DynamicUpdate 가 무잠금 조회 뒤 부분 변경의 교차 컬럼 되돌려쓰기를 막는지 검증한다(#776).
 *
 * <p>쓰기 트랜잭션이 회원을 잠금 없이 읽고 한 컬럼만 고친 뒤, 그 사이 다른 트랜잭션이 정지(status·token_version)를
 * 커밋하는 순서를 래치로 고정한다. 전 컬럼 UPDATE 였다면 늦게 커밋한 쪽이 정지를 옛 스냅샷으로 되돌린다(#760 전례).
 * 무잠금 쪽은 행잠금을 잡지 않으므로 정지 경로의 findByIdForUpdate 는 대기 없이 진행해 먼저 커밋한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class UserDynamicUpdateRaceTest extends IntegrationTestBase {

    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;
    private static final String UPDATED_NAME = "바뀐이름";

    @Autowired AdminUserCommandService adminUserCommandService;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;

    private ExecutorService executor;

    @AfterEach
    void tearDown() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @Test
    @DisplayName("무잠금으로 읽은 회원의 이름만 바꿔 커밋해도 그 사이 커밋된 정지를 되돌리지 않는다")
    void unlockedPartialUpdateNeverRevertsConcurrentSuspension() throws Exception {
        User admin = userRepository.saveAndFlush(UserFixture.admin());
        User target = userRepository.saveAndFlush(UserFixture.withName("경합대상"));
        int tokenVersionBeforeSuspend = target.getTokenVersion();
        ChangeUserStatusCommand suspendCommand = new ChangeUserStatusCommand(
                target.getId(), admin.getId(), UserStatus.SUSPENDED, "동적 UPDATE 경합 확인");

        CountDownLatch loadedWithoutLock = new CountDownLatch(1);
        CountDownLatch suspendCommitted = new CountDownLatch(1);
        executor = Executors.newFixedThreadPool(2);

        Future<?> renameOutcome = executor.submit(() -> transactionTemplate.executeWithoutResult(transactionStatus -> {
            User unlockedUser = userRepository.findById(target.getId()).orElseThrow();
            unlockedUser.updateProfile(UPDATED_NAME, null, null, null);
            loadedWithoutLock.countDown();
            awaitOrThrow(suspendCommitted);
        }));
        Future<?> suspendOutcome = executor.submit(() -> {
            awaitOrThrow(loadedWithoutLock);
            adminUserCommandService.changeStatus(suspendCommand);
            suspendCommitted.countDown();
        });

        suspendOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        renameOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);

        User afterBothCommits = userRepository.findById(target.getId()).orElseThrow();
        assertThat(afterBothCommits.getStatus())
                .as("이름만 바꾼 늦은 커밋이 먼저 커밋된 정지를 되돌려서는 안 된다")
                .isEqualTo(UserStatus.SUSPENDED);
        assertThat(afterBothCommits.getTokenVersion()).isEqualTo(tokenVersionBeforeSuspend + 1);
        assertThat(afterBothCommits.getName()).isEqualTo(UPDATED_NAME);
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
}
