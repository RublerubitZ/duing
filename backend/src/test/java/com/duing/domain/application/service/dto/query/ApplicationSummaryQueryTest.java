package com.duing.domain.application.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicationSummaryQueryTest {

    @Test
    @DisplayName("ASSIGNED InterviewSchedule 에 매핑된 interview 가 전달되면 interview = { startAt, endAt, location } 으로 채워진다")
    void assignedInterviewPopulatesInterview() {
        Application application = stubApplication();
        AssignedInterviewQuery interview = new AssignedInterviewQuery(
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                "3호관 201호");

        ApplicationSummaryQuery summary = ApplicationSummaryQuery.from(application, interview);

        assertThat(summary.interview()).isNotNull();
        assertThat(summary.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 0));
        assertThat(summary.interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 30));
        assertThat(summary.interview().location()).isEqualTo("3호관 201호");
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 없으면 interview 필드는 null 로 응답된다")
    void noScheduleResultsInNullInterview() {
        Application application = stubApplication();

        ApplicationSummaryQuery summary = ApplicationSummaryQuery.from(application, null);

        assertThat(summary.interview()).isNull();
    }

    @Test
    @DisplayName("from(application) 1-arg 단축형은 backward compatibility 를 위해 interview 를 null 로 기본화한다")
    void singleArgFromDefaultsInterviewToNull() {
        Application application = stubApplication();

        ApplicationSummaryQuery summary = ApplicationSummaryQuery.from(application);

        assertThat(summary.interview()).isNull();
    }

    private Application stubApplication() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");
        when(club.getCategory()).thenReturn(ClubCategory.ACADEMIC);
        when(club.getLogoUrl()).thenReturn(null);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));
        return application;
    }
}
