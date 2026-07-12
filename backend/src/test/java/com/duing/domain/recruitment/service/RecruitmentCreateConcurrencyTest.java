package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.repository.UserRepository;
import java.lang.reflect.Field;
import java.time.LocalDate;
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
class RecruitmentCreateConcurrencyTest extends IntegrationTestBase {

    @Autowired RecruitmentService recruitmentService;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 동시에 모집을 생성해도 정확히 한 건만 성공하고 OPEN 상태 모집은 1건만 남는다")
    void concurrentCreatesLeaveExactlyOneActiveRecruitment() throws Exception {
        User leaderA = saveUser("리더A", UserRole.STUDENT);
        User leaderB = saveUser("리더B", UserRole.STUDENT);
        Club club = saveActiveClub("동시생성동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderA));
        clubMemberRepository.save(ClubMember.of(club, leaderB,
                com.duing.domain.clubmember.entity.ClubMemberRole.OFFICER));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> taskA = () -> tryCreate(buildExternalCommand(club, leaderA, "모집A"));
        Callable<Throwable> taskB = () -> tryCreate(buildExternalCommand(club, leaderB, "모집B"));

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(taskA, taskB));
        pool.shutdown();
        assertThat(pool.awaitTermination(15, TimeUnit.SECONDS))
                .as("동시 생성 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract 1: 정확히 한 건만 성공 — race 가 두 OPEN 행을 동시에 만들지 못한다.
        long successes = outcomes.stream().map(this::quietGet).filter(throwable -> throwable == null).count();
        assertThat(successes).as("정확히 한 건만 성공").isEqualTo(1);

        // 핵심 contract 2: DB 에 OPEN 상태 모집은 1건만 남는다.
        long openCount = recruitmentRepository.findByClubIdOrderByStatusOpenFirstAndStartDateDesc(club.getId())
                .stream()
                .filter(recruitment -> recruitment.getStatus() == RecruitmentStatus.OPEN)
                .count();
        assertThat(openCount).as("OPEN 상태 모집은 1건만 존재").isEqualTo(1);
    }

    private Throwable tryCreate(CreateRecruitmentCommand command) {
        try {
            recruitmentService.create(command);
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

    private CreateRecruitmentCommand buildExternalCommand(Club club, User leader, String title) {
        return new CreateRecruitmentCommand(
                club.getId(),
                leader.getId(),
                title,
                null,
                LocalDate.now(),
                LocalDate.now().plusDays(7),
                10,
                ApplicationMode.EXTERNAL,
                "https://example.com/form",
                false,
                TargetRole.MEMBER,
                List.of(),
                null,
                null,
                false
        );
    }

    private User saveUser(String name, UserRole role) {
        long unique = sequence.getAndIncrement();
        return userRepository.save(User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name + unique,
                "hashed",
                role,
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
