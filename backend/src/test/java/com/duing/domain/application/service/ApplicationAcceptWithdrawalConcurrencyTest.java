package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.command.UpdateApplicationStatusCommand;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.util.List;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 탈퇴 × 합격 경합(감사 C24). 탈퇴 트랜잭션이 users 행을 잠근 채(soft-delete UPDATE 까지 낸 상태) 커밋 직전에 붙잡혀 있는 동안
 * 합격이 들어오면, 지원자 생존 판정이 없던 시절엔 회원 행 INSERT 의 users KEY SHARE 가 FOR NO KEY UPDATE 와 호환이라 즉시 통과해
 * 지워진 계정에 활성 회원 행이 생겼다. users 행 잠금 조회로 판정하면 합격은 탈퇴 커밋을 기다린 뒤 빈 결과를 읽어 거절된다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationAcceptWithdrawalConcurrencyTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("탈퇴 트랜잭션이 users 행을 잠근 채 커밋되면 뒤이은 합격은 없는 지원서로 거절되고 유령 회원 행이 생기지 않는다")
    void acceptYieldsToWithdrawalHoldingUserLock() throws Exception {
        Club club = saveActiveClub();
        User leader = userRepository.save(UserFixture.unique());
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        Recruitment recruitment = recruitmentRepository.save(Recruitment.create(club,
                "탈퇴합격경합모집-" + sequence.getAndIncrement(), null,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        User applicant = userRepository.save(UserFixture.unique());
        Application application = applicationRepository.save(
                Application.submit(recruitment, applicant, List.of()));

        CountDownLatch withdrawLocked = new CountDownLatch(1);
        CountDownLatch decisionDone = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes = pool.invokeAll(List.<Callable<Throwable>>of(
                () -> withdrawHoldingUserLock(applicant.getId(), withdrawLocked, decisionDone),
                () -> {
                    withdrawLocked.await();
                    try {
                        return tryAccept(application.getId(), leader.getId());
                    } finally {
                        decisionDone.countDown();
                    }
                }));
        pool.shutdown();
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS)).as("동시 처리 테스트가 시간 내에 완료").isTrue();

        assertThat(outcomes.get(0).get(15, TimeUnit.SECONDS)).as("탈퇴는 예외 없이 커밋된다").isNull();
        assertThat(outcomes.get(1).get(15, TimeUnit.SECONDS))
                .as("합격은 탈퇴 커밋을 기다린 뒤 없는 지원서로 거절된다")
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);
        // 파생 쿼리는 user 조인에 soft-delete 필터가 붙어 유령 행을 가릴 수 있어 jdbc 로 물리 부재를 본다.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_member WHERE club_id = ? AND user_id = ? AND deleted_at IS NULL",
                Integer.class, club.getId(), applicant.getId()))
                .as("탈퇴한 계정에 활성 회원 행이 물리적으로 없다").isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM application WHERE id = ?", String.class, application.getId()))
                .isEqualTo(ApplicationStatus.SUBMITTED.name());
    }

    /**
     * 탈퇴의 잠금·soft-delete 만 재현하고 커밋을 래치로 붙잡는다. 수정 전엔 합격이 잠금 없이 즉시 끝나 3초 안에 래치가 풀리고(유령 재현),
     * 수정 후엔 합격이 users 잠금에 대기하므로 타임아웃 뒤 커밋해 합격을 풀어준다. 양쪽 다 결정적이다.
     */
    private Throwable withdrawHoldingUserLock(Long userId, CountDownLatch withdrawLocked, CountDownLatch decisionDone) {
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

    private Throwable tryAccept(Long applicationId, Long leaderId) {
        try {
            applicationService.updateStatus(
                    new UpdateApplicationStatusCommand(applicationId, leaderId, ApplicationStatus.ACCEPTED));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("탈퇴합격경합동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
