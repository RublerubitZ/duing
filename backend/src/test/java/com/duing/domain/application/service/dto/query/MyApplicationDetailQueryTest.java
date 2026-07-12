package com.duing.domain.application.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
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
        AssignedInterviewQuery interview = new AssignedInterviewQuery(
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                "3호관 201호");

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.fromAll(
                application, 3, interview, deadline);

        assertThat(detailQuery.interviewAvailabilityCount()).isEqualTo(3);
        assertThat(detailQuery.interview()).isEqualTo(interview);
        assertThat(detailQuery.availabilityDeadline()).isEqualTo(deadline);
    }

    @Test
    @DisplayName("from 은 backward compatibility 를 위해 interview 진행 필드를 0/null/null 로 기본화한다")
    void fromKeepsBackwardCompatibilityWithDefaultInterviewFields() {
        Application application = stubApplication();

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.from(application);

        assertThat(detailQuery.interviewAvailabilityCount()).isZero();
        assertThat(detailQuery.interview()).isNull();
        assertThat(detailQuery.availabilityDeadline()).isNull();
    }

    @Test
    @DisplayName("ASSIGNED InterviewSchedule 에 매핑된 interview 가 있으면 fromAll 은 interview 를 보존한다")
    void fromAllAssignedInterviewPopulatesInterview() {
        Application application = stubApplication();
        AssignedInterviewQuery interview = new AssignedInterviewQuery(
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                "3호관 201호");

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.fromAll(
                application, 2, interview, LocalDateTime.of(2026, 6, 15, 18, 0));

        assertThat(detailQuery.interview()).isNotNull();
        assertThat(detailQuery.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 0));
        assertThat(detailQuery.interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 30));
        assertThat(detailQuery.interview().location()).isEqualTo("3호관 201호");
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 없는 호출은 interview = null 로 반환된다")
    void fromAllNoScheduleReturnsNullInterview() {
        Application application = stubApplication();

        MyApplicationDetailQuery detailQuery = MyApplicationDetailQuery.fromAll(
                application, 0, null, null);

        assertThat(detailQuery.interview()).isNull();
    }

    private Application stubApplication() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");

        RecruitmentQuestion questionOne = RecruitmentQuestion.createText("Q1");
        RecruitmentQuestion questionTwo = RecruitmentQuestion.createText("Q2");
        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of(questionOne, questionTwo));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(form);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of(
                new ApplicationAnswer(questionOne.id(), List.of("A1")),
                new ApplicationAnswer(questionTwo.id(), List.of("A2"))));
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));
        return application;
    }
}
