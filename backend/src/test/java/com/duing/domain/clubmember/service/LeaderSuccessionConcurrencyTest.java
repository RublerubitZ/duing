package com.duing.domain.clubmember.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.repository.LeaderSuccessionRequestRepository;
import com.duing.domain.clubmember.service.dto.command.CreateSuccessionCommand;
import com.duing.domain.clubmember.service.dto.command.ProcessSuccessionCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Callable;
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

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class LeaderSuccessionConcurrencyTest extends IntegrationTestBase {

    @Autowired LeaderSuccessionService successionService;
    @Autowired LeaderSuccessionRequestRepository requestRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 동시에 같은 요청을 APPROVED 와 REJECTED 로 처리해도 최종 status 와 권한 상태가 정확히 일관된다")
    void concurrentApproveAndRejectKeepsRequestAndMembershipConsistent() throws Exception {
        User leader = saveUser("리더");
        User requester = saveUser("요청자");
        User adminA = saveUser("관리자A");
        User adminB = saveUser("관리자B");
        Club club = saveActiveClub("승계동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leader));
        clubMemberRepository.save(ClubMember.of(club, requester, ClubMemberRole.OFFICER));

        Long requestId = successionService.create(
                new CreateSuccessionCommand(club.getId(), requester.getId(), "사유"));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> approveTask = () -> tryProcess(new ProcessSuccessionCommand(
                requestId, adminA.getId(), SuccessionStatus.APPROVED, "승인"));
        Callable<Throwable> rejectTask = () -> tryProcess(new ProcessSuccessionCommand(
                requestId, adminB.getId(), SuccessionStatus.REJECTED, "거절"));

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(approveTask, rejectTask));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 처리 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract 1: 정확히 한 건만 성공해야 한다. 두 분기가 동시에 종결시킬 수 없다.
        long successes = outcomes.stream().map(this::quietGet).filter(throwable -> throwable == null).count();
        assertThat(successes).as("정확히 한 건만 성공").isEqualTo(1);

        // 핵심 contract 2: 최종 status 와 ClubMember 권한 상태가 일관되어야 한다.
        // (Codex 가 지적한 시나리오 — status 가 REJECTED 인데 권한은 이전된 케이스가 절대 없어야 함.)
        LeaderSuccessionRequest finalRequest = requestRepository.findById(requestId).orElseThrow();
        ClubMemberRole leaderRoleAfter = clubMemberRepository.findByClubIdAndUserId(
                club.getId(), leader.getId()).orElseThrow().getRole();
        ClubMemberRole requesterRoleAfter = clubMemberRepository.findByClubIdAndUserId(
                club.getId(), requester.getId()).orElseThrow().getRole();

        if (finalRequest.getStatus() == SuccessionStatus.APPROVED) {
            assertThat(leaderRoleAfter)
                    .as("APPROVED 가 승자면 기존 리더는 MEMBER 로 강등").isEqualTo(ClubMemberRole.MEMBER);
            assertThat(requesterRoleAfter)
                    .as("APPROVED 가 승자면 요청자는 LEADER 로 승격").isEqualTo(ClubMemberRole.LEADER);
        } else {
            assertThat(finalRequest.getStatus())
                    .as("승자가 APPROVED 가 아니면 REJECTED 여야 한다").isEqualTo(SuccessionStatus.REJECTED);
            assertThat(leaderRoleAfter)
                    .as("REJECTED 가 승자면 기존 리더 권한 유지").isEqualTo(ClubMemberRole.LEADER);
            assertThat(requesterRoleAfter)
                    .as("REJECTED 가 승자면 요청자 OFFICER 유지").isEqualTo(ClubMemberRole.OFFICER);
        }
    }

    private Throwable tryProcess(ProcessSuccessionCommand command) {
        try {
            successionService.process(command);
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private Throwable quietGet(Future<Throwable> future) {
        try {
            return future.get(10, TimeUnit.SECONDS);
        } catch (Exception executionFailure) {
            return executionFailure;
        }
    }

    private User saveUser(String namePrefix) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                namePrefix + unique,
                "succession" + unique + "@daegu.ac.kr",
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()));
    }

    private Club saveActiveClub(String name) throws Exception {
        Club club = Club.create(name + "-" + sequence.getAndIncrement(),
                ClubCategory.OTHER, "분과", "설명", null);
        Field statusField = Club.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(club, ClubStatus.ACTIVE);
        return clubRepository.save(club);
    }
}
