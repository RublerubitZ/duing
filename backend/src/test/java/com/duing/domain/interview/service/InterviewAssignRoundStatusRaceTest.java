package com.duing.domain.interview.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mockingDetails;

import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.InterviewRoundFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.interview.controller.InterviewControllerTestSupport;
import com.duing.domain.interview.entity.InterviewRound;
import com.duing.domain.interview.entity.InterviewRoundMember;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.entity.RoundStatus;
import com.duing.domain.interview.exception.InterviewException;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.stubbing.Answer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 수동 배정·라운드 취소가 라운드를 잠금 조회로 처음 읽는지 검증한다 — 낡은 화면(expectedRoundStatus)의 쓰기가 다른
 * 운영진·다른 탭이 막 커밋한 전이(확정·취소·발송)를 보고 409 로 거절돼야 한다.
 *
 * <p>잠금 앞에서 라운드 엔티티를 한 번이라도 읽으면 커밋 전 단계가 1차 캐시에 남고, 뒤이은 FOR UPDATE 조회는
 * 새 행을 받아도 캐시된 엔티티를 돌려줘 쓰기가 통과한다. 전이 스레드가 라운드 행을 UPDATE 로 잠근 채 기다리고, 쓰기
 * 스레드가 잠금 조회에 들어가는 순간(스파이가 여는 래치) 전이가 커밋한다 — 그 앞의 읽기는 모두 커밋 전 값을 본다.
 * 전이는 jdbc UPDATE 라 버전을 올리지 않는다 — 취소처럼 라운드 행을 고치는 쓰기도 @Version 방어선 없이 잠금-첫조회만 시험한다.
 * 래치로만 순서를 강제하므로 sleep 이 없다. 리포지토리 스파이가 컨텍스트를 바꾸므로 다른 잠금 테스트와 분리한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewAssignRoundStatusRaceTest extends InterviewControllerTestSupport {

    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;

    @MockitoSpyBean InterviewRoundRepository roundRepositorySpy;
    @Autowired InterviewAssignmentService assignmentService;
    @Autowired InterviewRoundService roundService;
    @Autowired InterviewSlotRepository interviewSlotRepository;
    @Autowired InterviewScheduleRepository interviewScheduleRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private ExecutorService executor;
    private User leader;
    private InterviewRound round;
    private InterviewSlot slot;
    private InterviewRoundMember member;

    @BeforeEach
    void setUp() {
        leader = saveUser("리더");
        Club club = saveActiveClub("경합동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = saveInterviewRecruitment(club, "경합모집");
        round = interviewRoundRepository.save(InterviewRoundFixture.withStatus(
                recruitment.getId(), LocalDateTime.now().minusHours(1), null, RoundStatus.ASSIGNING));
        slot = interviewSlotRepository.save(InterviewSlot.create(round.getId(),
                LocalDateTime.now().plusDays(5), LocalDateTime.now().plusDays(5).plusMinutes(30), 1));
        Application application = saveInterviewPendingApplication(recruitment, "경합대상");
        member = interviewRoundMemberRepository.save(InterviewRoundMember.invite(round.getId(), application.getId()));
        executor = Executors.newFixedThreadPool(2);
    }

    @AfterEach
    void tearDown() {
        executor.shutdownNow();
    }

    @Test
    @DisplayName("배정 도중 다른 운영진의 확정이 커밋되면 배정 검토 화면의 배정은 409 이고 저장되지 않는다")
    void assignFromAssigningScreenLosesToCommittedConfirm() throws Exception {
        assertAssignRejectedAfterCommittedTransition(RoundStatus.SCHEDULED);
    }

    @Test
    @DisplayName("배정 도중 다른 운영진의 취소가 커밋되면 배정 검토 화면의 배정은 409 이고 저장되지 않는다")
    void assignFromAssigningScreenLosesToCommittedCancel() throws Exception {
        assertAssignRejectedAfterCommittedTransition(RoundStatus.CANCELLED);
    }

    @Test
    @DisplayName("폐기 도중 다른 탭의 발송이 커밋되면 초안이라고 본 폐기는 409 이고 라운드는 응답 수집 중 그대로다")
    void cancelExpectingDraftLosesToCommittedSend() throws Exception {
        // 모집에 라운드가 이것 하나라 모집당 DRAFT 1개 partial unique 와 부딪치지 않는다.
        jdbcTemplate.update("UPDATE interview_round SET status = ? WHERE id = ?",
                RoundStatus.DRAFT.name(), round.getId());

        Throwable cancelFailure = writeAfterCommittedTransition(RoundStatus.COLLECTING,
                () -> roundService.cancelRound(round.getId(), RoundStatus.DRAFT, leader.getId()));

        assertThat(cancelFailure)
                .as("초안이라고 본 폐기는 RoundStatusChanged 로 거절돼야 한다 — 실패하면 잠금 앞 선조회·검사 누락 중 하나(래치 타임아웃이면 잠금 조회 누락)")
                .isInstanceOf(InterviewException.RoundStatusChanged.class);
        assertThat(interviewRoundRepository.findById(round.getId()).orElseThrow().getStatus())
                .isEqualTo(RoundStatus.COLLECTING);
    }

    private void assertAssignRejectedAfterCommittedTransition(RoundStatus committedStatus) throws Exception {
        Throwable assignFailure = writeAfterCommittedTransition(committedStatus, () -> assignmentService.assignSchedule(
                round.getId(), member.getId(), slot.getId(), RoundStatus.ASSIGNING, leader.getId()));

        assertThat(assignFailure)
                .as("낡은 배정 검토 화면의 배정은 RoundStatusChanged 로 거절돼야 한다 — 실패하면 잠금 앞 선조회·검사 누락 중 하나(래치 타임아웃이면 잠금 조회 누락)")
                .isInstanceOf(InterviewException.RoundStatusChanged.class);
        assertThat(interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                round.getId(), member.getApplicationId(), InterviewScheduleStatus.ASSIGNED)).isEmpty();
    }

    /** 전이가 라운드 행을 쥔 사이 쓰기가 잠금 조회에 닿으면 전이를 커밋시키고, 쓰기가 던진 예외를 돌려준다(없으면 null). */
    private Throwable writeAfterCommittedTransition(RoundStatus committedStatus, Runnable roundWrite) throws Exception {
        CountDownLatch transitionLocked = new CountDownLatch(1);
        CountDownLatch writeReachedLockQuery = new CountDownLatch(1);
        // 리포지토리는 JDK 프록시라 Spring 이 위임 스파이로 만든다 — callRealMethod 대신 기본 응답(실제 리포지토리 위임)을 부른다.
        Answer<?> realRepository = mockingDetails(roundRepositorySpy).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            writeReachedLockQuery.countDown();
            return realRepository.answer(invocation);
        }).when(roundRepositorySpy).findByIdForUpdate(round.getId());

        Future<?> transition = executor.submit(() -> transactionTemplate.executeWithoutResult(transactionStatus -> {
            // UPDATE 가 행잠금을 커밋까지 쥔다 — 쓰기의 잠금 조회는 커밋 전에 닿으면 기다리고, 뒤에 닿으면 바로 읽어 어느 쪽이든 새 단계를 본다.
            jdbcTemplate.update("UPDATE interview_round SET status = ? WHERE id = ?",
                    committedStatus.name(), round.getId());
            transitionLocked.countDown();
            awaitOrThrow(writeReachedLockQuery);
        }));

        Future<Throwable> write = executor.submit(() -> {
            awaitOrThrow(transitionLocked);
            try {
                roundWrite.run();
                return null;
            } catch (Throwable writeFailure) {
                return writeFailure;
            }
        });

        Throwable writeFailure = write.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        transition.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        return writeFailure;
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
