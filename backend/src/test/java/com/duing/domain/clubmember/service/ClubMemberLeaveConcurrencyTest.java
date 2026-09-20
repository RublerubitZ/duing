package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.common.fixture.UserFixture;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.LeaveClubCommand;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import com.duing.domain.user.service.UserService;
import java.lang.reflect.Field;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 탈퇴·동아리 나가기 × 회장 인계 경합(#1138). 인계가 먼저 두 행을 FOR UPDATE 로 잡고 역할을 바꿔 커밋하는
 * 사이에 탈퇴/나가기가 들어오면, 무잠금 조회 시절엔 @SQLDelete 가 인계 커밋 위에 적용돼 LEADER 행이
 * soft-delete 됐다(회장 공석). 잠금 조회로 바꾸면 커밋 뒤 LEADER 로 재읽혀 409 로 막힌다.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ClubMemberLeaveConcurrencyTest extends IntegrationTestBase {

    @Autowired UserService userService;
    @Autowired ClubMemberCommandService clubMemberCommandService;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired TransactionTemplate transactionTemplate;
    @Autowired JdbcTemplate jdbcTemplate;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("회장 인계가 먼저 잠근 멤버십은 계정 탈퇴가 soft-delete 하지 못하고 409 로 막힌다")
    void withdrawalYieldsToLeaderTransferHoldingLocks() throws Exception {
        Club club = saveActiveClub();
        User leader = userRepository.save(UserFixture.unique());
        User successor = userRepository.save(UserFixture.unique());
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember successorMembership = clubMemberRepository.save(ClubMember.asMember(club, successor));

        CountDownLatch transferLocked = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> transferLeaderHoldingLocks(
                        leaderMembership.getId(), successorMembership.getId(), transferLocked),
                () -> awaitThen(transferLocked, () -> tryWithdraw(successor.getId())),
                null);

        assertThat(failures).as("인계에 진 탈퇴 한 건만 실패한다").hasSize(1);
        assertThat(failures.get(0))
                .as("withdraw 의 선검사는 잠금 전이라 통과하고, 잠금 재검증에서 LEADER 로 막힌다")
                .isInstanceOf(ClubMemberException.LeaderCannotLeave.class);
        assertThat(countOf("SELECT COUNT(*) FROM club_member WHERE club_id = ? AND role = 'LEADER' AND deleted_at IS NULL",
                club.getId())).as("승격된 회장 행이 살아 있다 — 회장 공석 없음").isEqualTo(1);
        assertThat(countOf("SELECT COUNT(*) FROM club_member WHERE user_id = ? AND deleted_at IS NOT NULL",
                successor.getId())).as("탈퇴가 롤백되어 멤버십 soft-delete 도 남지 않는다").isEqualTo(0);
        assertThat(countOf("SELECT COUNT(*) FROM users WHERE id = ? AND deleted_at IS NULL",
                successor.getId())).as("계정 soft-delete 도 함께 롤백된다").isEqualTo(1);
        assertThat(countOf("SELECT COUNT(*) FROM club_member_history WHERE target_user_id = ? AND event_type = 'LEFT'",
                successor.getId())).as("LEFT 이력이 남지 않는다").isEqualTo(0);
    }

    @Test
    @DisplayName("회장 인계가 먼저 잠근 멤버십은 동아리 나가기도 409 로 막힌다")
    void leaveYieldsToLeaderTransferHoldingLocks() throws Exception {
        Club club = saveActiveClub();
        User leader = userRepository.save(UserFixture.unique());
        User successor = userRepository.save(UserFixture.unique());
        ClubMember leaderMembership = clubMemberRepository.save(ClubMember.asLeader(club, leader));
        ClubMember successorMembership = clubMemberRepository.save(ClubMember.asMember(club, successor));

        CountDownLatch transferLocked = new CountDownLatch(1);
        List<Throwable> failures = runConcurrently(
                () -> transferLeaderHoldingLocks(
                        leaderMembership.getId(), successorMembership.getId(), transferLocked),
                () -> awaitThen(transferLocked, () -> tryLeave(club.getId(), successor.getId())),
                null);

        assertThat(failures).as("인계에 진 나가기 한 건만 실패한다").hasSize(1);
        assertThat(failures.get(0)).isInstanceOf(ClubMemberException.LeaderCannotLeave.class);
        assertThat(countOf("SELECT COUNT(*) FROM club_member WHERE club_id = ? AND role = 'LEADER' AND deleted_at IS NULL",
                club.getId())).as("승격된 회장 행이 살아 있다 — 회장 공석 없음").isEqualTo(1);
        assertThat(countOf("SELECT COUNT(*) FROM club_member WHERE user_id = ? AND deleted_at IS NOT NULL",
                successor.getId())).as("나가기가 롤백되어 soft-delete 가 남지 않는다").isEqualTo(0);
        assertThat(countOf("SELECT COUNT(*) FROM club_member_history WHERE target_user_id = ? AND event_type = 'LEFT'",
                successor.getId())).as("LEFT 이력이 남지 않는다").isEqualTo(0);
    }

    /**
     * 회장 인계의 잠금·역할 변경만 재현한다 — 서비스 transferLeader 는 커밋 시점을 붙잡을 수 없다.
     * 두 행을 FOR UPDATE 로 잡은 뒤 경쟁 스레드가 잠금 대기에 들어갈 때까지 기다리고 나서 역할을 바꿔 커밋한다.
     * 수정 전에는 경쟁 스레드의 커밋 flush(@SQLDelete UPDATE)가, 수정 후에는 SELECT FOR UPDATE 가 대기한다.
     */
    private Throwable transferLeaderHoldingLocks(Long leaderMembershipId, Long successorMembershipId,
                                                 CountDownLatch transferLocked) {
        try {
            transactionTemplate.executeWithoutResult(txStatus -> {
                ClubMember leaderMembership = clubMemberRepository.findByIdForUpdate(leaderMembershipId).orElseThrow();
                ClubMember successorMembership = clubMemberRepository.findByIdForUpdate(successorMembershipId).orElseThrow();
                transferLocked.countDown();
                awaitBlockedLock();
                // 부분 유니크 uk_club_member_leader_active 때문에 강등을 먼저 flush 해야 승격이 통과한다(assign 전례).
                leaderMembership.changeRole(ClubMemberRole.OFFICER);
                clubMemberRepository.flush();
                successorMembership.changeRole(ClubMemberRole.LEADER);
                clubMemberRepository.flush();
            });
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable tryWithdraw(Long userId) {
        try {
            userService.withdraw(userId);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable tryLeave(Long clubId, Long userId) {
        try {
            clubMemberCommandService.leave(new LeaveClubCommand(clubId, userId));
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private int countOf(String sql, Object... args) {
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, args);
        return count == null ? 0 : count;
    }

    private Throwable awaitThen(CountDownLatch startGate, Callable<Throwable> task) throws Exception {
        startGate.await();
        return task.call();
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
        throw new IllegalStateException("경쟁 탈퇴/나가기가 제한 시간 안에 잠금 대기에 진입하지 않았다.");
    }

    private void sleepBriefly() {
        try {
            Thread.sleep(50);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("잠금 대기 폴링이 중단되었다.", interrupted);
        }
    }

    private List<Throwable> runConcurrently(Callable<Throwable> firstTask, Callable<Throwable> secondTask,
                                            CountDownLatch startGate) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Future<Throwable>> outcomes;
        try {
            outcomes = List.of(pool.submit(firstTask), pool.submit(secondTask));
            if (startGate != null) {
                startGate.countDown();
            }
        } finally {
            pool.shutdown();
        }
        assertThat(pool.awaitTermination(20, TimeUnit.SECONDS))
                .as("동시성 테스트가 시간 내에 완료").isTrue();
        return outcomes.stream().map(this::quietGet).filter(Objects::nonNull).toList();
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(15, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private Club saveActiveClub() throws Exception {
        Club club = Club.create("탈퇴경합동아리-" + sequence.getAndIncrement(),
                ClubCategory.ACADEMIC, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
