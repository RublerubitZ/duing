package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.controller.ApplicationScope;
import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.query.ApplicationSummaryQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
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
import java.util.EnumSet;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.transaction.annotation.Transactional;

// @DirtiesContext 제거: 클래스에 @Transactional 이 선언되어 각 테스트가 자동으로 rollback 된다.
// 서비스 레이어 호출은 테스트 트랜잭션 내부에서 동작하므로 컨텍스트 재시작 없이 DB 격리가 보장된다.
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
class MyApplicationsScopeTest {

    @Autowired
    private ApplicationService applicationService;
    @Autowired
    private ApplicationRepository applicationRepository;
    @Autowired
    private ClubRepository clubRepository;
    @Autowired
    private RecruitmentRepository recruitmentRepository;
    @Autowired
    private UserRepository userRepository;

    private final AtomicLong sequence = new AtomicLong(System.nanoTime());

    @Test
    @DisplayName("scope=ACTIVE 는 SUBMITTED/UNDER_REVIEW/INTERVIEW_PENDING 만 반환한다")
    void activeScopeReturnsOnlyActiveStatuses() throws Exception {
        User applicant = saveStudent("지원자ACTIVE");
        // V38 partial unique 인덱스로 동아리당 OPEN 모집은 1건만 허용되므로,
        // 지원 status 별 픽스처를 동아리별로 분리한다.
        for (ApplicationStatus status : ApplicationStatus.values()) {
            Club club = saveClub("ACTIVE동아리-" + status);
            Recruitment recruitment = saveRecruitment(club, "ACTIVE모집-" + status);
            saveApplication(recruitment, applicant, status);
        }

        List<ApplicationSummaryQuery> result =
                applicationService.getMyApplications(applicant.getId(), ApplicationScope.ACTIVE.toStatuses());

        assertThat(result).hasSize(3);
        assertThat(result).extracting(ApplicationSummaryQuery::status)
                .containsExactlyInAnyOrder(
                        ApplicationStatus.SUBMITTED,
                        ApplicationStatus.UNDER_REVIEW,
                        ApplicationStatus.INTERVIEW_PENDING
                );
    }

    @Test
    @DisplayName("scope=ARCHIVED 는 ACCEPTED/REJECTED 만 반환한다")
    void archivedScopeReturnsOnlyTerminalStatuses() throws Exception {
        User applicant = saveStudent("지원자ARCHIVED");
        saveApplication(saveRecruitment(saveClub("ARCHIVED동아리-SUBMITTED"), "ARCHIVED모집-SUBMITTED"),
                applicant, ApplicationStatus.SUBMITTED);
        saveApplication(saveRecruitment(saveClub("ARCHIVED동아리-ACCEPTED"), "ARCHIVED모집-ACCEPTED"),
                applicant, ApplicationStatus.ACCEPTED);
        saveApplication(saveRecruitment(saveClub("ARCHIVED동아리-REJECTED"), "ARCHIVED모집-REJECTED"),
                applicant, ApplicationStatus.REJECTED);

        List<ApplicationSummaryQuery> result =
                applicationService.getMyApplications(applicant.getId(), ApplicationScope.ARCHIVED.toStatuses());

        assertThat(result).hasSize(2);
        assertThat(result).extracting(ApplicationSummaryQuery::status)
                .containsExactlyInAnyOrder(ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED);
    }

    @Test
    @DisplayName("scope=ALL 은 모든 상태를 반환한다 (기존 호환)")
    void allScopeReturnsEveryStatus() throws Exception {
        User applicant = saveStudent("지원자ALL");
        for (ApplicationStatus status : ApplicationStatus.values()) {
            Club club = saveClub("ALL동아리-" + status);
            Recruitment recruitment = saveRecruitment(club, "ALL모집-" + status);
            saveApplication(recruitment, applicant, status);
        }

        List<ApplicationSummaryQuery> result =
                applicationService.getMyApplications(applicant.getId(), ApplicationScope.ALL.toStatuses());

        assertThat(result).hasSize(ApplicationStatus.values().length);
        assertThat(result).extracting(ApplicationSummaryQuery::status)
                .containsExactlyInAnyOrderElementsOf(EnumSet.allOf(ApplicationStatus.class));
    }

    private User saveStudent(String name) {
        long unique = sequence.getAndIncrement();
        User user = User.create(
                String.format("%010d", unique % 10_000_000_000L),
                name,
                "hashed",
                UserRole.STUDENT,
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "미설정",
                "010-0000-0000",
                LocalDateTime.now()
        );
        return userRepository.save(user);
    }

    private Club saveClub(String name) {
        String uniqueName = name + "-" + sequence.getAndIncrement();
        Club club = Club.create(uniqueName, ClubCategory.OTHER, "분과", "설명", null);
        return clubRepository.save(club);
    }

    private Recruitment saveRecruitment(Club club, String title) {
        LocalDate today = LocalDate.now();
        String uniqueTitle = title + "-" + sequence.getAndIncrement();
        Recruitment recruitment = Recruitment.create(club, uniqueTitle, null, today.minusDays(1), today.plusDays(7), 10);
        return recruitmentRepository.save(recruitment);
    }

    private Application saveApplication(Recruitment recruitment, User user, ApplicationStatus status) throws Exception {
        Application application = Application.submit(recruitment, user,
                List.of(new ApplicationAnswer("q1", List.of("답변-" + sequence.getAndIncrement()))));
        if (status != ApplicationStatus.SUBMITTED) {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, status);
        }
        return applicationRepository.save(application);
    }

}
