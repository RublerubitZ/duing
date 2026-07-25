package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.exception.ClubMemberException;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.dto.command.AssignLeaderByAdminCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class GeneralAdminLeaderAssignmentServiceConcurrencyTest extends IntegrationTestBase {

    @Autowired AdminLeaderAssignmentService service;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;
    @Autowired ClubRepository clubRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("회장이 없는 동아리에 두 어드민이 동시에 강제 지정해도 LEADER 는 한 명만 남는다")
    void concurrentAssignmentsResultInExactlyOneLeader() throws Exception {
        User admin = userRepository.save(newUser(UserRole.ADMIN));
        User candidateA = userRepository.save(newUser(UserRole.STUDENT));
        User candidateB = userRepository.save(newUser(UserRole.STUDENT));
        Club club = clubRepository.save(Club.create(
                "C" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.of(club, candidateA, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(club, candidateB, ClubMemberRole.MEMBER));

        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger rejections = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);

        Runnable assignA = () -> attempt(start, successes, rejections,
                new AssignLeaderByAdminCommand(club.getId(), candidateA.getId(), admin.getId(), "동시-A"));
        Runnable assignB = () -> attempt(start, successes, rejections,
                new AssignLeaderByAdminCommand(club.getId(), candidateB.getId(), admin.getId(), "동시-B"));

        pool.submit(assignA);
        pool.submit(assignB);
        start.countDown();
        pool.shutdown();
        boolean finished = pool.awaitTermination(15, TimeUnit.SECONDS);
        assertThat(finished).as("동시성 테스트가 시간 내에 완료").isTrue();

        // 두 요청이 모두 조회 단계를 통과하면 뒤늦은 쪽이 유니크 인덱스에 걸려 거절되고,
        // 앞선 요청이 커밋된 뒤 조회한 경우에는 교체 경로를 타 정상 성공한다. 타이밍에 따라
        // 성공 건수는 1~2 로 갈리므로 "모든 요청이 성공 또는 레이스 거절로 끝나고 회장은 한 명"만 단언한다.
        assertThat(successes.get() + rejections.get())
                .as("모든 요청이 성공 또는 레이스 거절로 종료").isEqualTo(2);
        assertThat(successes.get()).isGreaterThanOrEqualTo(1);

        long leaderCount = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(club.getId()).stream()
                .filter(member -> member.getRole() == ClubMemberRole.LEADER)
                .count();
        assertThat(leaderCount).isEqualTo(1);
    }

    @Test
    @DisplayName("회장이 있는 동아리에 두 어드민이 동시에 강제 교체해도 LEADER 는 한 명만 남는다")
    void concurrentReplacementsResultInExactlyOneLeader() throws Exception {
        User admin = userRepository.save(newUser(UserRole.ADMIN));
        User currentLeader = userRepository.save(newUser(UserRole.STUDENT));
        User candidateA = userRepository.save(newUser(UserRole.STUDENT));
        User candidateB = userRepository.save(newUser(UserRole.STUDENT));
        Club club = clubRepository.save(Club.create(
                "C" + sequence.incrementAndGet(), ClubCategory.ACADEMIC, null, "설명", null));
        clubMemberRepository.save(ClubMember.asLeader(club, currentLeader));
        clubMemberRepository.save(ClubMember.of(club, candidateA, ClubMemberRole.MEMBER));
        clubMemberRepository.save(ClubMember.of(club, candidateB, ClubMemberRole.MEMBER));

        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger rejections = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(2);

        pool.submit(() -> attempt(start, successes, rejections, new AssignLeaderByAdminCommand(
                club.getId(), candidateA.getId(), admin.getId(), "교체-A")));
        pool.submit(() -> attempt(start, successes, rejections, new AssignLeaderByAdminCommand(
                club.getId(), candidateB.getId(), admin.getId(), "교체-B")));
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시성 테스트가 시간 내에 완료").isTrue();

        assertThat(successes.get() + rejections.get()).isEqualTo(2);
        assertThat(successes.get()).isGreaterThanOrEqualTo(1);

        long leaderCount = clubMemberRepository
                .findAllByClubIdOrderedByRoleAndJoinedAt(club.getId()).stream()
                .filter(member -> member.getRole() == ClubMemberRole.LEADER)
                .count();
        assertThat(leaderCount).isEqualTo(1);
    }

    private void attempt(CountDownLatch start, AtomicInteger successes, AtomicInteger rejections,
                         AssignLeaderByAdminCommand command) {
        try {
            start.await();
            service.assign(command);
            successes.incrementAndGet();
        } catch (ClubMemberException.ConcurrentSuccessionUpdateException expected) {
            rejections.incrementAndGet();
        } catch (ClubMemberException.AdminAssignLeaderAlreadyExists expected) {
            rejections.incrementAndGet();
        } catch (org.springframework.dao.DataIntegrityViolationException race) {
            rejections.incrementAndGet();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }

    private User newUser(UserRole role) {
        long seq = sequence.incrementAndGet();
        return User.create("20" + seq, "U" + seq, "h", role,
                Grade.FRESHMAN, College.IT_ENGINEERING, "미설정", "010-0000-0000", LocalDateTime.now());
    }
}
