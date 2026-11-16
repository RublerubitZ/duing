package com.duing.domain.club.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.exception.ClubException;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.club.service.dto.command.CloseClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubFacilitySecuredTimeTargetCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.util.Map;
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
 * 동아리 행을 고치는 세 경로(프로필 수정·중앙동아리 여부·시설 확보 대상)가 동아리를 잠그고 읽어,
 * 그사이 커밋된 상태 변경·폐쇄를 전 컬럼 UPDATE 의 옛 값으로 덮지 않는지 지킨다.
 * 경쟁 트랜잭션(실제 updateStatus·close)이 커밋 직전에 멈춘 사이 요청을 보내고, 판정은 잠금이 풀린 뒤의 결과로 한다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubWritePathsRowLockTest extends IntegrationTestBase {

    @Autowired ClubService clubService;
    @Autowired ClubClosureService clubClosureService;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("총동연 승인이 커밋되기 전에 들어온 운영진 프로필 수정은 승인을 대기 상태로 되돌리지 않는다")
    void leaderProfileUpdateDoesNotRevertApproval() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveClub(ClubStatus.PENDING_APPROVAL, null);
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Outcome outcome = requestWhileRivalHolds(
                () -> clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.ACTIVE, null, admin.getId())),
                () -> clubService.update(descriptionCommand(club.getId(), leader.getId())));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(outcome.requestFailure()).isNull();
        assertThat(row.get("description")).isEqualTo("경합 중 수정한 설명");
        assertThat(row.get("status")).as("승인(ACTIVE)이 운영진 수정의 옛 값(PENDING_APPROVAL)으로 덮이면 안 된다")
                .isEqualTo("ACTIVE");
    }

    @Test
    @DisplayName("폐쇄가 커밋되기 전에 들어온 반려 동아리 운영진의 프로필 수정은 폐쇄된 동아리를 되살리지 않는다")
    void leaderProfileUpdateDoesNotResurrectClosedRejectedClub() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        User leader = userRepository.save(UserFixture.unique());
        Club club = saveClub(ClubStatus.REJECTED, "반려 사유");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));

        Outcome outcome = requestWhileRivalHolds(
                () -> clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "폐쇄 사유")),
                () -> clubService.update(descriptionCommand(club.getId(), leader.getId())));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(row.get("deleted_at")).as("폐쇄(soft-delete)가 운영진 수정의 옛 값(deleted_at NULL)으로 덮이면 안 된다")
                .isNotNull();
        assertThat(outcome.requestFailure()).isInstanceOf(ClubException.ClubNotFoundException.class);
    }

    @Test
    @DisplayName("폐쇄가 커밋되기 전에 들어온 총동연 프로필 수정은 운영 중단 동아리의 폐쇄를 되돌리지 않는다")
    void adminProfileUpdateDoesNotResurrectClosedInactiveClub() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        Club club = saveClub(ClubStatus.INACTIVE, null);

        Outcome outcome = requestWhileRivalHolds(
                () -> clubClosureService.close(new CloseClubCommand(club.getId(), admin.getId(), "폐쇄 사유")),
                () -> clubService.updateAsAdmin(descriptionCommand(club.getId(), admin.getId())));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(row.get("deleted_at")).as("폐쇄(soft-delete)가 총동연 수정의 옛 값으로 덮이면 안 된다").isNotNull();
        assertThat(outcome.requestFailure()).isInstanceOf(ClubException.ClubNotFoundException.class);
    }

    @Test
    @DisplayName("운영 중단이 커밋되기 전에 들어온 중앙동아리 여부 변경은 운영 중단을 운영 중으로 되돌리지 않는다")
    void centralClubChangeDoesNotRevertDeactivation() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        Club club = saveClub(ClubStatus.ACTIVE, null);

        Outcome outcome = requestWhileRivalHolds(
                () -> clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.INACTIVE, null, admin.getId())),
                () -> clubService.updateCentralClub(new UpdateClubCentralClubCommand(club.getId(), true)));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(outcome.requestFailure()).isNull();
        assertThat(row.get("central_club")).isEqualTo(true);
        assertThat(row.get("status")).as("운영 중단(INACTIVE)이 옛 값(ACTIVE)으로 덮이면 안 된다").isEqualTo("INACTIVE");
    }

    @Test
    @DisplayName("운영 중단이 커밋되기 전에 들어온 시설 확보 대상 변경은 운영 중단을 운영 중으로 되돌리지 않는다")
    void securedTargetChangeDoesNotRevertDeactivation() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        Club club = saveClub(ClubStatus.ACTIVE, null);

        Outcome outcome = requestWhileRivalHolds(
                () -> clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.INACTIVE, null, admin.getId())),
                () -> clubService.updateFacilitySecuredTimeTarget(
                        new UpdateClubFacilitySecuredTimeTargetCommand(club.getId(), true, admin.getId())));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(outcome.requestFailure()).isNull();
        assertThat(row.get("facility_secured_time_target")).isEqualTo(true);
        assertThat(row.get("status")).as("운영 중단(INACTIVE)이 옛 값(ACTIVE)으로 덮이면 안 된다").isEqualTo("INACTIVE");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM club_audit_event WHERE club_id = ? AND event_type = 'SECURED_TARGET_CHANGED'",
                Integer.class, club.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("운영 중단이 커밋되기 전에 들어온 총동연 프로필 수정은 운영 중단을 운영 중으로 되돌리지 않는다")
    void adminProfileUpdateDoesNotRevertDeactivation() throws Exception {
        User admin = userRepository.save(UserFixture.admin());
        Club club = saveClub(ClubStatus.ACTIVE, null);

        Outcome outcome = requestWhileRivalHolds(
                () -> clubService.updateStatus(new UpdateClubStatusCommand(club.getId(), ClubStatus.INACTIVE, null, admin.getId())),
                () -> clubService.updateAsAdmin(descriptionCommand(club.getId(), admin.getId())));

        Map<String, Object> row = clubRow(club.getId());
        assertThat(outcome.rivalFailure()).isNull();
        assertThat(outcome.requestFailure()).isNull();
        assertThat(row.get("description")).isEqualTo("경합 중 수정한 설명");
        assertThat(row.get("status")).as("운영 중단(INACTIVE)이 총동연 수정의 옛 값(ACTIVE)으로 덮이면 안 된다").isEqualTo("INACTIVE");
    }

    // ---- 기법: 경쟁 트랜잭션이 실제 서비스로 club 행 잠금을 쥔 채 커밋 직전에 멈춘 사이 요청을 보내고,
    // 요청이 행 잠금 대기에 들어간 것을 pg_locks 로 확인한 뒤 풀어 '풀린 뒤의 결과'로 판정한다.

    private record Outcome(Throwable rivalFailure, Throwable requestFailure) {}

    private Outcome requestWhileRivalHolds(Runnable rivalWork, Runnable request) throws Exception {
        CountDownLatch rivalHoldsLock = new CountDownLatch(1);
        CountDownLatch rivalMayCommit = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Throwable> rival = executor.submit(capture(() -> transactionTemplate.executeWithoutResult(transaction -> {
                rivalWork.run();
                rivalHoldsLock.countDown();
                awaitQuietly(rivalMayCommit);
            })));
            assertThat(rivalHoldsLock.await(15, TimeUnit.SECONDS)).as("경쟁 트랜잭션이 잠금을 쥔 채 멈춤").isTrue();
            Future<Throwable> requesting = executor.submit(capture(request));
            awaitBlockedLock();
            rivalMayCommit.countDown();
            Throwable rivalFailure = rival.get(30, TimeUnit.SECONDS);
            Throwable requestFailure = requesting.get(30, TimeUnit.SECONDS);
            return new Outcome(rivalFailure, requestFailure);
        } finally {
            rivalMayCommit.countDown();
            executor.shutdownNow();
        }
    }

    private static Callable<Throwable> capture(Runnable work) {
        return () -> {
            try {
                work.run();
                return null;
            } catch (Throwable failure) {
                return failure;
            }
        };
    }

    private void awaitBlockedLock() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10);
        while (System.nanoTime() < deadline) {
            Integer blocked = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM pg_locks
                     WHERE NOT granted AND pid <> pg_backend_pid() AND locktype IN ('transactionid', 'tuple')
                    """, Integer.class);
            if (blocked != null && blocked > 0) {
                return;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException(interrupted);
            }
        }
        throw new IllegalStateException("요청이 제한 시간 안에 행 잠금 대기에 들어가지 않았다.");
    }

    private static void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(20, TimeUnit.SECONDS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }

    private Map<String, Object> clubRow(Long clubId) {
        return jdbcTemplate.queryForMap(
                "SELECT status, deleted_at, description, central_club, facility_secured_time_target FROM club WHERE id = ?",
                clubId);
    }

    private Club saveClub(ClubStatus status, String rejectionReason) throws Exception {
        Club club = Club.create("행잠금-" + sequence.getAndIncrement(), ClubCategory.ACADEMIC, "분과", "원래 설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, status);
        Field reasonField = Club.class.getDeclaredField("rejectionReason");
        reasonField.setAccessible(true);
        reasonField.set(club, rejectionReason);
        return clubRepository.save(club);
    }

    private static UpdateClubCommand descriptionCommand(Long clubId, Long requesterId) {
        return new UpdateClubCommand(clubId, requesterId,
                null, null, null, "경합 중 수정한 설명", null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null);
    }
}
