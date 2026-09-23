package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.controller.InterviewControllerTestSupport;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.service.dto.command.UpdateInterviewSlotCommand;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 면접 쓰기 경로가 인가를 비관 잠금보다 먼저 끝내는지 검증한다 (#839).
 *
 * <p>인가가 잠금 뒤에 있으면 인증만 된 타 동아리 사용자가 임의 라운드·슬롯 행을 자기 트랜잭션이 끝날 때까지
 * 잠글 수 있다. 거부된 스레드는 거부 직후 트랜잭션을 열어 둔 채 멈추고, 그 사이 탐침 스레드가 같은 행을
 * {@code lock_timeout} 1초로 FOR UPDATE 잠근다 — 잠금이 새어 있으면 탐침이 lock_timeout 예외로 실패한다.
 * 래치로만 순서를 강제하므로 sleep 이 없다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewLockAfterAuthorizationTest extends InterviewControllerTestSupport {

    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;

    @Autowired InterviewAssignmentService assignmentService;
    @Autowired InterviewSlotService slotService;
    @Autowired InterviewSlotRepository interviewSlotRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private ExecutorService executor;
    private InterviewRound round;
    private User outsider;

    @BeforeEach
    void setUp() {
        User leader = saveUser("리더");
        Club club = saveActiveClub("잠금동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "잠금모집");
        round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().plusDays(3), null, RoundStatus.ASSIGNING));
        outsider = saveUser("타동아리");
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    @DisplayName("타 동아리 사용자의 멤버 제외 요청은 거부되는 동안 라운드 행을 잠그지 않는다")
    void deniedExcludeMemberDoesNotHoldRoundLock() throws Exception {
        assertDeniedCallLeavesRowUnlocked(
                () -> assignmentService.excludeMember(round.getId(), Long.MAX_VALUE, outsider.getId()),
                () -> interviewRoundRepository.findByIdForUpdate(round.getId()).isPresent(),
                InterviewException.RoundNotFound.class);
    }

    @Test
    @DisplayName("타 동아리 사용자의 슬롯 수정 요청은 거부되는 동안 슬롯 행을 잠그지 않는다")
    void deniedUpdateSlotDoesNotHoldSlotLock() throws Exception {
        InterviewSlot slot = interviewSlotRepository.save(InterviewSlot.create(round.getId(),
                LocalDateTime.now().plusDays(5), LocalDateTime.now().plusDays(5).plusMinutes(30), 1));

        assertDeniedCallLeavesRowUnlocked(
                () -> slotService.updateSlot(
                        new UpdateInterviewSlotCommand(slot.getId(), outsider.getId(), null, null, 2)),
                () -> interviewSlotRepository.findByIdForUpdate(slot.getId()).isPresent(),
                InterviewException.SlotNotFound.class);
    }

    // 비멤버 거부는 미존재와 같은 리소스 404 로 수렴한다(#835) — 슬롯 경로는 SlotNotFound, 라운드 경로는 RoundNotFound.
    private void assertDeniedCallLeavesRowUnlocked(Runnable deniedCall, Supplier<Boolean> lockProbe,
                                                   Class<? extends Throwable> expectedDenial) throws Exception {
        CountDownLatch denied = new CountDownLatch(1);
        CountDownLatch probeDone = new CountDownLatch(1);

        Future<Throwable> deniedOutcome = executor.submit(() -> {
            Throwable denial = null;
            try {
                transactionTemplate.executeWithoutResult(transactionStatus -> {
                    try {
                        deniedCall.run();
                    } finally {
                        denied.countDown();
                        awaitOrThrow(probeDone);
                    }
                });
            } catch (Throwable deniedCallFailure) {
                // 콜백이 던진 거부 예외를 TransactionTemplate 이 롤백 후 그대로 재던진다(UnexpectedRollback 은 콜백이 삼켰을 때만).
                denial = deniedCallFailure;
            }
            return denial;
        });

        Future<Boolean> probeOutcome = executor.submit(() -> {
            try {
                awaitOrThrow(denied);
                return transactionTemplate.execute(transactionStatus -> {
                    jdbcTemplate.execute("SET LOCAL lock_timeout = '1000'");
                    return lockProbe.get();
                });
            } finally {
                probeDone.countDown();
            }
        });

        assertThat(probeOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("거부된 요청이 행잠금을 쥐고 있으면 탐침이 lock_timeout 으로 실패한다").isTrue();
        assertThat(deniedOutcome.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .isInstanceOf(expectedDenial);
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
