package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
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

// @DirtiesContext 제거: 테스트가 1개뿐이고, IntegrationTestBase.cleanDatabase() 로 매 실행 전
// DB 상태를 초기화한다. 동시성 테스트는 별도 트랜잭션에서 동작하므로 @Transactional rollback 대신
// truncate 전략을 사용한다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ApplicationStatusConcurrencyTest extends IntegrationTestBase {

    @Autowired ApplicationService applicationService;
    @Autowired ApplicationRepository applicationRepository;
    @Autowired RecruitmentRepository recruitmentRepository;
    @Autowired ClubRepository clubRepository;
    @Autowired ClubMemberRepository clubMemberRepository;
    @Autowired UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("두 운영진이 동시에 ACCEPTED 와 REJECTED 를 시도하면 한쪽만 성공하고 최종 status 와 ClubMember 가 항상 일관된다")
    void concurrentAcceptAndRejectKeepsApplicationAndMemberConsistent() throws Exception {
        User leaderA = saveUser("리더A", UserRole.STUDENT);
        User leaderB = saveUser("리더B", UserRole.STUDENT);
        User applicant = saveUser("지원자", UserRole.STUDENT);
        Club club = saveActiveClub("동시처리동아리");
        clubMemberRepository.save(ClubMember.asLeader(club, leaderA));
        clubMemberRepository.save(ClubMember.asMember(club, leaderB));
        // leaderB 도 운영진 권한이 필요하므로 OFFICER 로 승급
        clubMemberRepository.findByClubIdAndUserId(club.getId(), leaderB.getId())
                .orElseThrow()
                .changeRole(com.duing.domain.clubmember.entity.ClubMemberRole.OFFICER);

        Recruitment recruitment = recruitmentRepository.save(
                Recruitment.create(club, "동시처리모집", null,
                        LocalDate.now().minusDays(1), LocalDate.now().plusDays(7), 10));
        Application underReview = saveApplicationWithStatus(
                recruitment, ApplicationStatus.UNDER_REVIEW, applicant);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        Callable<Throwable> acceptTask = () -> tryUpdate(
                new UpdateApplicationStatusCommand(
                        underReview.getId(), leaderA.getId(), ApplicationStatus.ACCEPTED));
        Callable<Throwable> rejectTask = () -> tryUpdate(
                new UpdateApplicationStatusCommand(
                        underReview.getId(), leaderB.getId(), ApplicationStatus.REJECTED));

        List<Future<Throwable>> outcomes = pool.invokeAll(List.of(acceptTask, rejectTask));
        pool.shutdown();
        boolean finished = pool.awaitTermination(15, TimeUnit.SECONDS);
        assertThat(finished).as("동시성 테스트가 시간 내에 완료").isTrue();

        // 핵심 contract: 정확히 한 건만 성공한다. 다른 한 건은 어떤 이유로든(전이 차단 또는 OptimisticLock 충돌)
        // 실패해야 하며, 두 건 모두 성공해서 last-writer-wins 가 발생해서는 안 된다.
        long successes = outcomes.stream().map(this::quietGet).filter(throwable -> throwable == null).count();
        assertThat(successes).as("정확히 한 건만 성공").isEqualTo(1);

        // 핵심 contract: 사용자가 보고한 불일치 — REJECTED + ClubMember 존재 — 가 절대 발생하지 않는다.
        Application reloaded = applicationRepository.findById(underReview.getId()).orElseThrow();
        boolean memberExists = clubMemberRepository.existsByClubIdAndUserId(club.getId(), applicant.getId());

        if (reloaded.getStatus() == ApplicationStatus.ACCEPTED) {
            assertThat(memberExists)
                    .as("ACCEPTED 가 승자면 ClubMember 가 존재해야 한다").isTrue();
        } else {
            assertThat(reloaded.getStatus()).isEqualTo(ApplicationStatus.REJECTED);
            assertThat(memberExists)
                    .as("REJECTED 가 승자면 ClubMember 가 존재해서는 안 된다").isFalse();
        }
    }

    private Throwable tryUpdate(UpdateApplicationStatusCommand command) {
        try {
            applicationService.updateStatus(command);
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

    private Application saveApplicationWithStatus(Recruitment recruitment, ApplicationStatus status,
                                                  User applicant) throws Exception {
        Application application = Application.submit(recruitment, applicant, List.of());
        Field statusField = Application.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(application, status);
        return applicationRepository.save(application);
    }
}
