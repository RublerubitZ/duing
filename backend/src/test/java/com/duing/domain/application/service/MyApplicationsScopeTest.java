package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.application.controller.ApplicationScope;
import com.duing.domain.application.entity.Application;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.transaction.annotation.Transactional;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
@Transactional
@DirtiesContext
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
        Club club = saveClub("ACTIVE동아리");
        for (ApplicationStatus status : ApplicationStatus.values()) {
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
        Club club = saveClub("ARCHIVED동아리");
        saveApplication(saveRecruitment(club, "ARCHIVED모집-SUBMITTED"), applicant, ApplicationStatus.SUBMITTED);
        saveApplication(saveRecruitment(club, "ARCHIVED모집-ACCEPTED"), applicant, ApplicationStatus.ACCEPTED);
        saveApplication(saveRecruitment(club, "ARCHIVED모집-REJECTED"), applicant, ApplicationStatus.REJECTED);

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
        Club club = saveClub("ALL동아리");
        for (ApplicationStatus status : ApplicationStatus.values()) {
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
                "user" + unique + "@daegu.ac.kr",
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
        Application application = Application.submit(recruitment, user, List.of("답변-" + sequence.getAndIncrement()));
        if (status != ApplicationStatus.SUBMITTED) {
            Field statusField = Application.class.getDeclaredField("status");
            statusField.setAccessible(true);
            statusField.set(application, status);
        }
        return applicationRepository.save(application);
    }

}
