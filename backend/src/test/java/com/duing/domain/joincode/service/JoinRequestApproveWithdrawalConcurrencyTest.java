package com.duing.domain.joincode.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.ClubJoinRequest;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.Callable;
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
 * 탈퇴 × 승인 경합(#1142). 탈퇴 트랜잭션이 users 행을 잠근 채(soft-delete UPDATE 까지 낸 상태) 커밋 직전에
 * 붙잡혀 있는 동안 승인이 들어오면, 요청자 생존 판정이 없던 시절엔 멤버십 INSERT 의 users KEY SHARE 가
 * FOR NO KEY UPDATE 와 호환이라 즉시 통과해 soft-delete 계정에 활성 멤버십이 생겼다. users 행 잠금 조회로
 * 바꾸면 승인은 탈퇴 커밋을 기다린 뒤 빈 결과를 읽어 자동 거절된다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JoinRequestApproveWithdrawalConcurrencyTest extends IntegrationTestBase {

    @Autowired JoinRequestService joinRequestService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired TransactionTemplate transactionTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("탈퇴 트랜잭션이 users 행을 잠근 채 커밋되면 뒤이은 승인은 자동 거절되고 유령 멤버십이 생기지 않는다")
    void approveYieldsToWithdrawalHoldingUserLock() throws Exception {
        Club club = saveActiveClub();
        User leader = saveLeaderOf(club);
        ClubJoinCode joinCode = saveJoinCode(club, 10);
        User student = saveUser();
        ClubJoinRequest joinRequest = savePendingRequest(club, student, joinCode);

        CountDownLatch withdrawLocked = new CountDownLatch(1);
        CountDownLatch decisionDone = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> withdrawHoldingUserLock(student.getId(), withdrawLocked, decisionDone),
                () -> {
                    withdrawLocked.await();
                    try {
                        return tryDecide(club.getId(), joinRequest.getId(), leader.getId(),
                                JoinRequestStatus.APPROVED);
                    } finally {
                        decisionDone.countDown();
                    }
                });

        assertThat(failures).as("양쪽 다 예외 없이 끝난다 — 승인은 자동 거절이라는 정상 리턴").isEmpty();
        assertThat(clubMemberRepository.findByClubIdAndUserId(club.getId(), student.getId()))
                .as("soft-delete 된 계정에 활성 멤버십이 생기지 않는다").isEmpty();
        ClubJoinRequest processed = clubJoinRequestRepository.findById(joinRequest.getId()).orElseThrow();
        assertThat(processed.getStatus()).isEqualTo(JoinRequestStatus.REJECTED);
        assertThat(processed.getRejectReason()).isEqualTo("탈퇴한 회원");
        assertThat(clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow().getUsedCount())
                .as("자동 거절은 확보했던 자리를 환급한다").isZero();
    }

    /**
     * 탈퇴의 잠금·soft-delete 만 재현하고 커밋을 래치로 붙잡는다 — 서비스 withdraw 는 커밋 시점을 못 붙잡는다.
     * 수정 전엔 승인이 잠금 없이 즉시 끝나 3초 안에 래치가 풀리고(유령 재현), 수정 후엔 승인이 users 잠금에
     * 대기하므로 타임아웃 뒤 커밋해 승인을 풀어준다. 양쪽 다 결정적이다.
     */
    private Throwable withdrawHoldingUserLock(Long userId, CountDownLatch withdrawLocked,
                                              CountDownLatch decisionDone) {
        try {
            transactionTemplate.executeWithoutResult(txStatus -> {
                User locked = userRepository.findByIdForUpdate(userId).orElseThrow();
                userRepository.delete(locked);
                userRepository.flush();
                withdrawLocked.countDown();
                try {
                    decisionDone.await(3, TimeUnit.SECONDS);
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("래치 대기가 중단되었다.", interrupted);
                }
            });
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private List<Throwable> runConcurrently(Callable<Throwable> firstTask, Callable<Throwable> secondTask)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(firstTask, secondTask));
        pool.shutdown();
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS))
                .as("동시 처리 테스트가 시간 내에 완료").isTrue();
        return outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();
    }

    private Throwable tryDecide(Long clubId, Long joinRequestId, Long requesterId, JoinRequestStatus status) {
        try {
            joinRequestService.decide(
                    new DecideJoinRequestCommand(clubId, joinRequestId, requesterId, status));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(15, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private ClubJoinRequest savePendingRequest(Club club, User student, ClubJoinCode joinCode) {
        ClubJoinCode stored = clubJoinCodeRepository.findById(joinCode.getId()).orElseThrow();
        stored.tryConsume();
        clubJoinCodeRepository.save(stored);
        return clubJoinRequestRepository.save(ClubJoinRequest.pending(club, student, joinCode));
    }

    private ClubJoinCode saveJoinCode(Club club, int maxUses) {
        return clubJoinCodeRepository.save(ClubJoinCode.issue(
                club, saveOpenExternalRecruitment(club), codeOf(sequence.getAndIncrement()), 12, maxUses, 7, null));
    }

    private String codeOf(long seq) {
        String candidate = Long.toString(Math.abs(seq), 32).toUpperCase();
        return candidate.substring(candidate.length() - 6).replace('0', 'A').replace('1', 'B');
    }

    private User saveUser() {
        return userRepository.save(UserFixture.unique());
    }

    private User saveLeaderOf(Club club) {
        User leader = saveUser();
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        return leader;
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("탈퇴승인경합동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }

    private Recruitment saveOpenExternalRecruitment(Club club) {
        return recruitmentRepository.save(Recruitment.createWithOptions(club,
                "외부 폼 모집-" + sequence.getAndIncrement(), "내용",
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.example.com/duing", false,
                TargetRole.MEMBER, null, null, false));
    }
}
