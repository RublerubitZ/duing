package com.duing.domain.application.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery.AvailabilityItem;
import com.duing.domain.club.entity.Club;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ApplicantDetailQueryTest {

    @Test
    @DisplayName("fromAll 은 면접 가능시간 목록을 빈 리스트로, 배정 슬롯/면접을 null 로 받아도 안전하게 매핑된다")
    void emptyAvailabilitiesAndNullAssignedSlotAreMapped() {
        Application application = stubApplication();

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null, List.of(), null, null);

        assertThat(detailQuery.interviewAvailabilities()).isEmpty();
        assertThat(detailQuery.assignedSlot()).isNull();
        assertThat(detailQuery.interview()).isNull();
    }

    @Test
    @DisplayName("fromAll 은 면접 가능시간 다수와 현재 배정 슬롯/배정 면접을 그대로 보존한다")
    void multipleAvailabilitiesAndAssignedSlotAreRetained() {
        Application application = stubApplication();
        AvailabilityItem first = new AvailabilityItem(1L,
                LocalDateTime.of(2026, 6, 13, 13, 0), LocalDateTime.of(2026, 6, 13, 13, 30));
        AvailabilityItem second = new AvailabilityItem(2L,
                LocalDateTime.of(2026, 6, 13, 14, 0), LocalDateTime.of(2026, 6, 13, 14, 30));
        AvailabilityItem assigned = new AvailabilityItem(5L,
                LocalDateTime.of(2026, 6, 13, 18, 0), LocalDateTime.of(2026, 6, 13, 18, 30));
        AssignedInterviewQuery interview = new AssignedInterviewQuery(
                LocalDateTime.of(2026, 6, 13, 18, 0),
                LocalDateTime.of(2026, 6, 13, 18, 30),
                "3호관 201호");

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null,
                List.of(first, second), assigned, interview);

        assertThat(detailQuery.interviewAvailabilities()).containsExactly(first, second);
        assertThat(detailQuery.assignedSlot()).isEqualTo(assigned);
        assertThat(detailQuery.interview()).isEqualTo(interview);
    }

    @Test
    @DisplayName("4-arg fromAll 은 backward compatibility 를 위해 interview 필드를 빈 리스트/null 로 기본화한다")
    void backwardCompatibleFromAllDefaultsInterviewFields() {
        Application application = stubApplication();

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null);

        assertThat(detailQuery.interviewAvailabilities()).isEmpty();
        assertThat(detailQuery.assignedSlot()).isNull();
        assertThat(detailQuery.interview()).isNull();
    }

    @Test
    @DisplayName("interviewAvailabilities 가 null 로 들어와도 빈 리스트로 정규화된다")
    void nullAvailabilitiesAreNormalizedToEmptyList() {
        Application application = stubApplication();

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null, null, null, null);

        assertThat(detailQuery.interviewAvailabilities()).isEmpty();
        assertThat(detailQuery.assignedSlot()).isNull();
        assertThat(detailQuery.interview()).isNull();
    }

    @Test
    @DisplayName("ASSIGNED InterviewSchedule 에 매핑된 interview 가 전달되면 interview = { startAt, endAt, location } 으로 채워진다")
    void assignedInterviewIsPopulated() {
        Application application = stubApplication();
        AssignedInterviewQuery interview = new AssignedInterviewQuery(
                LocalDateTime.of(2026, 6, 20, 18, 0),
                LocalDateTime.of(2026, 6, 20, 18, 30),
                "3호관 201호");

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null, List.of(), null, interview);

        assertThat(detailQuery.interview()).isNotNull();
        assertThat(detailQuery.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 0));
        assertThat(detailQuery.interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 18, 30));
        assertThat(detailQuery.interview().location()).isEqualTo("3호관 201호");
    }

    @Test
    @DisplayName("ASSIGNED schedule 이 없으면 interview 필드는 null 로 응답된다")
    void noScheduleResultsInNullInterview() {
        Application application = stubApplication();

        ApplicantDetailQuery detailQuery = ApplicantDetailQuery.fromAll(
                application, List.of(), List.of(), null, List.of(), null, null);

        assertThat(detailQuery.interview()).isNull();
    }

    private Application stubApplication() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(7L);
        when(club.getName()).thenReturn("동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("모집 공고");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);

        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("지원자");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("applicant@daegu.ac.kr");

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 15, 9, 30));
        return application;
    }
}
