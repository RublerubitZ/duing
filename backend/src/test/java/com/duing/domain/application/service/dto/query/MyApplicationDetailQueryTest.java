package com.duing.domain.application.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class MyApplicationDetailQueryTest {

    @Test
    @DisplayName("fromAll 은 interview 진행/배정/마감 필드를 그대로 채워 반환한다")
    void fromAllPopulatesInterviewProgressionFields() {
        Application application = stubApplication();
        LocalDateTime deadline = LocalDateTime.of(2026, 6, 15, 18, 0);

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.fromAll(
                application, 3, false, deadline);

        assertThat(detailQuery.interviewAvailabilityCount()).isEqualTo(3);
        assertThat(detailQuery.interviewScheduleAssigned()).isFalse();
        assertThat(detailQuery.availabilityDeadline()).isEqualTo(deadline);
    }

    @Test
    @DisplayName("from 은 backward compatibility 를 위해 interview 진행 필드를 0/false/null 로 기본화한다")
    void fromKeepsBackwardCompatibilityWithDefaultInterviewFields() {
        Application application = stubApplication();

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.from(application);

        assertThat(detailQuery.interviewAvailabilityCount()).isZero();
        assertThat(detailQuery.interviewScheduleAssigned()).isFalse();
        assertThat(detailQuery.availabilityDeadline()).isNull();
    }

    @Test
    @DisplayName("fromAll 은 일정 배정이 완료된 지원의 scheduleAssigned 를 true 로 반환한다")
    void fromAllMarksScheduleAssignedWhenTrue() {
        Application application = stubApplication();

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.fromAll(
                application, 2, true, LocalDateTime.of(2026, 6, 15, 18, 0));

        assertThat(detailQuery.interviewScheduleAssigned()).isTrue();
    }

    private Application stubApplication() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("Q1", "Q2"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(form);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("A1", "A2"));
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getInterviewAt()).thenReturn(LocalDateTime.of(2026, 5, 20, 14, 0));
        when(application.getInterviewLocation()).thenReturn("본관 301호");
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));
        return application;
    }
}
