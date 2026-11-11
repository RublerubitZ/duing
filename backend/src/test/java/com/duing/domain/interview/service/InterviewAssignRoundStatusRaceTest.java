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
 * 수동 배정이 라운드를 잠금 조회로 처음 읽는지 검증한다 — 낡은 배정 검토 화면(expectedRoundStatus=ASSIGNING)의 배정이
 * 다른 운영진이 막 커밋한 확정·취소를 보고 409 로 거절돼야 한다.
 *
 * <p>잠금 앞에서 라운드 엔티티를 한 번이라도 읽으면 커밋 전 ASSIGNING 이 1차 캐시에 남고, 뒤이은 FOR UPDATE 조회는
 * 새 행을 받아도 캐시된 엔티티를 돌려줘 배정이 저장된다. 전이 스레드가 라운드 행을 UPDATE 로 잠근 채 기다리고, 배정
 * 스레드가 잠금 조회에 들어가는 순간(스파이가 여는 래치) 전이가 커밋한다 — 그 앞의 읽기는 모두 커밋 전 값을 본다.
 * 래치로만 순서를 강제하므로 sleep 이 없다. 리포지토리 스파이가 컨텍스트를 바꾸므로 다른 잠금 테스트와 분리한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class InterviewAssignRoundStatusRaceTest extends InterviewControllerTestSupport {

    private static final long LATCH_TIMEOUT_SECONDS = 15;
    private static final long TASK_TIMEOUT_SECONDS = 30;

    @MockitoSpyBean InterviewRoundRepository roundRepositorySpy;
    @Autowired InterviewAssignmentService assignmentService;
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

    private void assertAssignRejectedAfterCommittedTransition(RoundStatus committedStatus) throws Exception {
        CountDownLatch transitionLocked = new CountDownLatch(1);
        CountDownLatch assignReachedLockQuery = new CountDownLatch(1);
        // 리포지토리는 JDK 프록시라 Spring 이 위임 스파이로 만든다 — callRealMethod 대신 기본 응답(실제 리포지토리 위임)을 부른다.
        Answer<?> realRepository = mockingDetails(roundRepositorySpy).getMockCreationSettings().getDefaultAnswer();
        doAnswer(invocation -> {
            assignReachedLockQuery.countDown();
            return realRepository.answer(invocation);
        }).when(roundRepositorySpy).findByIdForUpdate(round.getId());

        Future<?> transition = executor.submit(() -> transactionTemplate.executeWithoutResult(transactionStatus -> {
            // UPDATE 가 행잠금을 커밋까지 쥔다 — 배정의 잠금 조회는 커밋 전에 닿으면 기다리고, 뒤에 닿으면 바로 읽어 어느 쪽이든 새 단계를 본다.
            jdbcTemplate.update("UPDATE interview_round SET status = ? WHERE id = ?",
                    committedStatus.name(), round.getId());
            transitionLocked.countDown();
            awaitOrThrow(assignReachedLockQuery);
        }));

        Future<Throwable> assign = executor.submit(() -> {
            awaitOrThrow(transitionLocked);
            try {
                assignmentService.assignSchedule(
                        round.getId(), member.getId(), slot.getId(), RoundStatus.ASSIGNING, leader.getId());
                return null;
            } catch (Throwable assignFailure) {
                return assignFailure;
            }
        });

        assertThat(assign.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS))
                .as("낡은 배정 검토 화면의 배정은 RoundStatusChanged 로 거절돼야 한다 — 실패하면 잠금 앞 선조회·잠금 누락·검사 누락 중 하나")
                .isInstanceOf(InterviewException.RoundStatusChanged.class);
        transition.get(TASK_TIMEOUT_SECONDS, TimeUnit.SECONDS);
        assertThat(interviewScheduleRepository.findByRoundIdAndApplicationIdAndStatus(
                round.getId(), member.getApplicationId(), InterviewScheduleStatus.ASSIGNED)).isEmpty();
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
