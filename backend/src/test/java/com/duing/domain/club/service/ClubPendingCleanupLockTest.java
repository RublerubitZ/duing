package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.PendingItemsFixture;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.query.ClubPendingCleanupResult;
import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.repository.ClubJoinCodeRepository;
import com.duing.domain.joincode.repository.ClubJoinRequestRepository;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.global.exception.ApplicationException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 재활성화 × 남은 미결 정리 경합(스펙 §7 잠금 우선, §9 #1). 재활성화가 동아리 행을 잠그고 ACTIVE 로 바꾼 채 기다리는 사이 정리가
 * 들어오면, 정리는 첫 조회(findByIdForUpdate)에서 잠금을 기다렸다가 커밋된 ACTIVE 를 보고 409 로 끝나야 한다.
 * 재활성화는 정리가 잠금 대기에 들어간 것(pg_locks)을 확인한 뒤에야 커밋한다 — 잠금 없이 stale INACTIVE 를 읽는 구현은 정리가
 * 그냥 끝나 대기가 생기지 않으므로 재활성화 쪽 대기 가드가 시간 초과로 실패한다. 먼저 무잠금으로 읽고 나중에 잠그는 구현은 대기는
 * 생기지만 1차 캐시의 stale INACTIVE 로 정리가 성공해 409 단정에서 걸린다. 최종 상태만 보는 두 요청 경합 형식은 그 차이를
 * 구분하지 못해 쓰지 않는다(JoinRequestCreateConcurrencyTest·ClubMemberLeaveConcurrencyTest 선례).
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubPendingCleanupLockTest extends IntegrationTestBase {

    @Autowired ClubPendingCleanupService clubPendingCleanupService;
    @Autowired ClubRepository clubRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired ClubJoinCodeRepository clubJoinCodeRepository;
    @Autowired ClubJoinRequestRepository clubJoinRequestRepository;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired Clock clock;

    @Test
    @DisplayName("재활성화가 동아리 행을 잠근 사이 들어온 정리는 잠금을 기다렸다가 바뀐 상태를 보고 409 로 끝나며 지원서는 그대로다")
    void cleanupWaitsForReactivationLockAndSeesActiveStatus() throws Exception {
        // 동아리 id 와 처리자 id 가 겹치면 두 인자를 뒤바꾼 회귀를 못 잡는다 — 일부러 어긋나게 둔다.
        userRepository.save(UserFixture.unique());
        User admin = userRepository.save(UserFixture.admin());
        Club club = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        Application application = PendingItemsFixture.saveApplication(applicationRepository,
                PendingItemsFixture.saveRecruitment(recruitmentRepository, club, LocalDate.now(clock), true),
                userRepository.save(UserFixture.unique()), ApplicationStatus.SUBMITTED);

        CountDownLatch clubLocked = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<Throwable> reactivation;
        Future<Throwable> cleanup;
        try {
            reactivation = pool.submit(() -> reactivateHoldingClubLock(club.getId(), admin.getId(), clubLocked));
            cleanup = pool.submit(() -> {
                awaitLatch(clubLocked);
                return tryCleanup(club.getId(), admin.getId());
            });
        } finally {
            pool.shutdown();
        }
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS)).as("재활성화와 정리가 시간 안에 끝난다").isTrue();

        assertThat(quietGet(reactivation))
                .as("재활성화는 정리가 잠금 대기에 들어간 것을 본 뒤 커밋된다 — 대기가 없으면 여기서 시간 초과 예외")
                .isNull();
        Throwable cleanupFailure = quietGet(cleanup);
        assertThat(cleanupFailure)
                .as("정리는 잠금이 풀린 뒤 커밋된 ACTIVE 를 본다")
                .isInstanceOf(ClubException.ClubNotInactiveException.class);
        assertThat(((ApplicationException) cleanupFailure).getStatus()).isEqualTo(HttpStatus.CONFLICT);

        Map<String, Object> applicationRow = jdbcTemplate.queryForMap(
                "SELECT status, ended_by_club_deactivation FROM application WHERE id = ?", application.getId());
        assertThat(applicationRow.get("status")).isEqualTo("SUBMITTED");
        assertThat(applicationRow.get("ended_by_club_deactivation")).isEqualTo(false);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM application_status_history WHERE application_id = ?",
                Integer.class, application.getId())).as("상태 이력도 남지 않는다").isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT status FROM club WHERE id = ?", String.class, club.getId()))
                .isEqualTo("ACTIVE");
    }

    @Test
    @DisplayName("두 담당자가 같은 동아리를 동시에 정리하면 하나는 실제 건수, 다른 하나는 잠금을 기다렸다가 0건으로 성공한다")
    void concurrentCleanupsAreSerialized() throws Exception {
        // 동아리 id 와 처리자 id 가 겹치면 두 인자를 뒤바꾼 회귀를 못 잡는다 — 일부러 어긋나게 둔다.
        userRepository.save(UserFixture.unique());
        User firstAdmin = userRepository.save(UserFixture.admin());
        User secondAdmin = userRepository.save(UserFixture.admin());
        Club club = PendingItemsFixture.saveClub(clubRepository, ClubStatus.INACTIVE);
        LocalDate today = LocalDate.now(clock);
        Recruitment firstRecruitment = PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, true);
        PendingItemsFixture.saveApplication(applicationRepository, firstRecruitment,
                userRepository.save(UserFixture.unique()), ApplicationStatus.SUBMITTED);
        PendingItemsFixture.saveApplication(applicationRepository,
                PendingItemsFixture.saveRecruitment(recruitmentRepository, club, today, true),
                userRepository.save(UserFixture.unique()), ApplicationStatus.ON_HOLD);
        ClubJoinCode joinCode = PendingItemsFixture.saveJoinCode(clubJoinCodeRepository, club, firstRecruitment);
        PendingItemsFixture.savePendingJoinRequest(clubJoinCodeRepository, clubJoinRequestRepository, club, joinCode,
                userRepository.save(UserFixture.unique()));
        int usedCountBeforeCleanup = usedCountOf(joinCode);

        CountDownLatch firstCleanupHoldsLock = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<ClubPendingCleanupResult> firstCleanup;
        Future<ClubPendingCleanupResult> secondCleanup;
        try {
            // 첫 정리는 바깥 트랜잭션에 합류해, 두 번째 정리가 동아리 잠금 대기에 들어간 것을 본 뒤에야 커밋한다.
            firstCleanup = pool.submit(() -> transactionTemplate.execute(txStatus -> {
                ClubPendingCleanupResult result = clubPendingCleanupService.cleanup(club.getId(), firstAdmin.getId());
                applicationRepository.flush();
                firstCleanupHoldsLock.countDown();
                awaitBlockedLock();
                return result;
            }));
            secondCleanup = pool.submit(() -> {
                awaitLatch(firstCleanupHoldsLock);
                return clubPendingCleanupService.cleanup(club.getId(), secondAdmin.getId());
            });
        } finally {
            pool.shutdown();
        }
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS)).as("두 정리가 시간 안에 끝난다").isTrue();

        assertThat(firstCleanup.get(1, TimeUnit.SECONDS))
                .as("먼저 잠근 정리가 지원서 2건·가입 신청 1건을 처리한다 — 두 번째의 잠금 대기를 못 보면 여기서 시간 초과 예외")
                .isEqualTo(new ClubPendingCleanupResult(2, 1));
        assertThat(secondCleanup.get(1, TimeUnit.SECONDS))
                .as("늦게 온 정리는 잠금이 풀린 뒤 커밋된 결과를 보고 남은 것이 없다")
                .isEqualTo(new ClubPendingCleanupResult(0, 0));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM application_status_history h JOIN application a ON a.id = h.application_id "
                        + "JOIN recruitment r ON r.id = a.recruitment_id WHERE r.club_id = ?",
                Integer.class, club.getId())).as("이력은 지원서마다 한 번만 남는다").isEqualTo(2);
        assertThat(usedCountOf(joinCode)).as("가입 링크 자리는 한 번만 돌려준다").isEqualTo(usedCountBeforeCleanup - 1);
    }

    /**
     * 재활성화의 잠금·상태 변경만 재현한다 — 서비스 updateStatus 는 커밋 시점을 붙잡을 수 없다.
     * 동아리 행을 FOR UPDATE 로 잡고 ACTIVE 로 바꿔 flush 한 뒤, 정리 스레드가 잠금 대기에 들어갈 때까지 기다리고 커밋한다.
     */
    private Throwable reactivateHoldingClubLock(Long clubId, Long adminId, CountDownLatch clubLocked) {
        try {
            transactionTemplate.executeWithoutResult(txStatus -> {
                Club lockedClub = clubRepository.findByIdForUpdate(clubId).orElseThrow();
                lockedClub.changeStatus(ClubStatus.ACTIVE, null, adminId);
                clubRepository.flush();
                clubLocked.countDown();
                awaitBlockedLock();
            });
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private void awaitLatch(CountDownLatch latch) throws InterruptedException {
        if (!latch.await(10, TimeUnit.SECONDS)) {
            throw new IllegalStateException("앞 트랜잭션이 제한 시간 안에 동아리 잠금을 잡지 않았다.");
        }
    }

    private int usedCountOf(ClubJoinCode joinCode) {
        return jdbcTemplate.queryForObject(
                "SELECT used_count FROM club_join_code WHERE id = ?", Integer.class, joinCode.getId());
    }

    private Throwable tryCleanup(Long clubId, Long adminId) {
        try {
            clubPendingCleanupService.cleanup(clubId, adminId);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private void awaitBlockedLock() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM pg_locks WHERE NOT granted", Integer.class);
            if (blocked != null && blocked > 0) {
                return;
            }
            sleepBriefly();
        }
        throw new IllegalStateException("정리가 제한 시간 안에 동아리 잠금 대기에 진입하지 않았다.");
    }

    private void sleepBriefly() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("잠금 대기 폴링이 중단되었다.", interrupted);
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }
}
