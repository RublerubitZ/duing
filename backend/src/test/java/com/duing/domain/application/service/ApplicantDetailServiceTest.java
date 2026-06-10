package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery.AvailabilityItem;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.entity.InterviewConfig;
import com.duing.domain.interview.entity.InterviewSchedule;
import com.duing.domain.interview.entity.InterviewScheduleStatus;
import com.duing.domain.interview.entity.InterviewSlot;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewConfigRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.service.InterviewAvailabilityService;
import com.duing.domain.interview.service.dto.query.InterviewSlotTimeWindow;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.access.AccessDeniedException;

class ApplicantDetailServiceTest {

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository = mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository = mock(ApplicationEvaluationRepository.class);
    private final InterviewAvailabilityService interviewAvailabilityService = mock(InterviewAvailabilityService.class);
    private final InterviewAvailabilityRepository interviewAvailabilityRepository = mock(InterviewAvailabilityRepository.class);
    private final InterviewScheduleRepository interviewScheduleRepository = mock(InterviewScheduleRepository.class);
    private final InterviewConfigRepository interviewConfigRepository = mock(InterviewConfigRepository.class);
    private final InterviewSlotRepository interviewSlotRepository = mock(InterviewSlotRepository.class);

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            applicationDraftService,
            applicationStatusHistoryRepository,
            applicationEvaluationRepository,
            interviewAvailabilityService,
            interviewAvailabilityRepository,
            interviewScheduleRepository,
            interviewConfigRepository,
            interviewSlotRepository);

    @Test
    @DisplayName("SELF 모집의 지원서를 동아리 운영진이 조회하면 질문·답변이 인덱스 기준으로 매핑되어 반환된다")
    void leaderCanReadSelfFormApplicationWithPairedAnswers() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("홍길동");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("hong@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("지원 동기는?", "장기 목표는?"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("2026 봄 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getForm()).thenReturn(form);

        LocalDateTime submittedAt = LocalDateTime.of(2026, 5, 15, 10, 0);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("동아리에 관심이 많습니다.", "부회장을 목표로 합니다."));
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(submittedAt);

        when(applicationRepository.findWithRecruitmentAndClubById(1L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(1L, 99L);

        assertThat(detail.applicationId()).isEqualTo(1L);
        assertThat(detail.recruitmentId()).isEqualTo(3L);
        assertThat(detail.recruitmentTitle()).isEqualTo("2026 봄 모집");
        assertThat(detail.clubId()).isEqualTo(5L);
        assertThat(detail.clubName()).isEqualTo("두잉 동아리");
        assertThat(detail.applicant().userId()).isEqualTo(20L);
        assertThat(detail.applicant().name()).isEqualTo("홍길동");
        assertThat(detail.applicant().studentId()).isEqualTo("20251234");
        assertThat(detail.applicant().email()).isEqualTo("hong@example.com");
        assertThat(detail.answers()).hasSize(2);
        assertThat(detail.answers().get(0).question()).isEqualTo("지원 동기는?");
        assertThat(detail.answers().get(0).answer()).isEqualTo("동아리에 관심이 많습니다.");
        assertThat(detail.answers().get(1).question()).isEqualTo("장기 목표는?");
        assertThat(detail.answers().get(1).answer()).isEqualTo("부회장을 목표로 합니다.");
        assertThat(detail.status()).isEqualTo(ApplicationStatus.SUBMITTED);
        // useInterview 가 false (기본값) 인 SELF 모집은 interview 가 null 이다.
        assertThat(detail.interview()).isNull();
        assertThat(detail.submittedAt()).isEqualTo(submittedAt);
    }

    @Test
    @DisplayName("외부 폼 모집의 지원서를 조회하면 answers 는 빈 목록이고 나머지 필드는 정상 반환된다")
    void externalFormApplicationReturnsEmptyAnswers() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("김철수");
        when(applicant.getStudentId()).thenReturn("20251111");
        when(applicant.getEmail()).thenReturn("kim@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(4L);
        when(recruitment.getTitle()).thenReturn("2026 외부 폼 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(2L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 9, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(2L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(2L, 99L);

        assertThat(detail.answers()).isEmpty();
        assertThat(detail.applicationId()).isEqualTo(2L);
        assertThat(detail.recruitmentTitle()).isEqualTo("2026 외부 폼 모집");
        assertThat(detail.applicant().name()).isEqualTo("김철수");
    }

    @Test
    @DisplayName("다른 동아리의 운영진이 조회를 시도하면 AccessDeniedException 이 발생한다")
    void differentClubOfficerCannotReadApplicantDetail() {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);

        User applicant = mock(User.class);

        Application application = mock(Application.class);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);

        when(applicationRepository.findWithRecruitmentAndClubById(1L)).thenReturn(Optional.of(application));

        // 다른 동아리의 운영진(userId=777)은 club 5에 권한이 없으므로 AccessDeniedException
        doThrow(new AccessDeniedException("해당 동아리의 운영진(LEADER/OFFICER)만 가능한 작업입니다."))
                .when(clubAuthService).requireManager(777L, 5L);

        assertThatThrownBy(() -> applicationService.getApplicantDetail(1L, 777L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @DisplayName("존재하지 않는 applicationId 로 조회하면 ApplicationNotFoundException 이 발생한다")
    void missingApplicationIdThrowsNotFoundException() {
        when(applicationRepository.findWithRecruitmentAndClubById(404L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> applicationService.getApplicantDetail(404L, 99L))
                .isInstanceOf(ApplicationDomainException.ApplicationNotFoundException.class);
    }

    @Test
    @DisplayName("질문 수가 답변 수보다 적을 때 짧은 쪽 길이까지만 매핑되고 초과 답변은 무시된다")
    void questionsLessThanAnswersMapsByMinLength() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("이영희");
        when(applicant.getStudentId()).thenReturn("20252222");
        when(applicant.getEmail()).thenReturn("lee@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        // 질문 1개, 답변 3개 — 짧은 쪽(질문) 길이만큼만 매핑되어야 함
        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("지원 동기는?"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(5L);
        when(recruitment.getTitle()).thenReturn("2026 테스트 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getForm()).thenReturn(form);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(3L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("동기 답변", "여분 답변 1", "여분 답변 2"));
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 11, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(3L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(3L, 99L);

        // 질문 1개까지만 매핑, 초과 답변 2개는 무시됨
        assertThat(detail.answers()).hasSize(1);
        assertThat(detail.answers().get(0).question()).isEqualTo("지원 동기는?");
        assertThat(detail.answers().get(0).answer()).isEqualTo("동기 답변");
    }

    @Test
    @DisplayName("면접 사용 모집의 지원자 상세는 가능시간/배정 슬롯 레포지토리를 호출해 응답에 포함한다")
    void interviewRecruitmentLoadsAvailabilitiesAndAssignedSlot() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("지원자");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("hong@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("면접 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitment.isUseInterview()).thenReturn(true);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(10L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 9, 0));

        // interview 도메인 레포지토리는 자체 표현(InterviewSlotTimeWindow) 으로 반환하고,
        // application 서비스가 application 도메인 표현(AvailabilityItem) 으로 매핑한다.
        InterviewSlotTimeWindow firstWindow = new InterviewSlotTimeWindow(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30));
        InterviewSlotTimeWindow secondWindow = new InterviewSlotTimeWindow(102L,
                LocalDateTime.of(2026, 6, 20, 14, 30), LocalDateTime.of(2026, 6, 20, 15, 0));
        InterviewSlotTimeWindow assignedWindow = new InterviewSlotTimeWindow(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30));

        when(applicationRepository.findWithRecruitmentAndClubById(10L)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(10L))
                .thenReturn(List.of(firstWindow, secondWindow));
        when(interviewScheduleRepository.findAssignedSlotByApplicationId(10L))
                .thenReturn(Optional.of(assignedWindow));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(10L, 99L);

        AvailabilityItem expectedFirst = new AvailabilityItem(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30));
        AvailabilityItem expectedSecond = new AvailabilityItem(102L,
                LocalDateTime.of(2026, 6, 20, 14, 30), LocalDateTime.of(2026, 6, 20, 15, 0));
        AvailabilityItem expectedAssigned = new AvailabilityItem(101L,
                LocalDateTime.of(2026, 6, 20, 14, 0), LocalDateTime.of(2026, 6, 20, 14, 30));
        assertThat(detail.interviewAvailabilities()).containsExactly(expectedFirst, expectedSecond);
        assertThat(detail.assignedSlot()).isEqualTo(expectedAssigned);
    }

    @Test
    @DisplayName("면접을 사용하지 않는 모집의 지원자 상세는 면접 레포지토리를 전혀 호출하지 않고 빈 응답을 반환한다")
    void nonInterviewRecruitmentSkipsInterviewRepositoryCalls() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("지원자");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("hong@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("면접 미사용 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitment.isUseInterview()).thenReturn(false);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(11L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 9, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(11L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(11L, 99L);

        assertThat(detail.interviewAvailabilities()).isEmpty();
        assertThat(detail.assignedSlot()).isNull();
        verify(interviewAvailabilityRepository, never()).findAvailabilityItemsByApplicationId(11L);
        verify(interviewScheduleRepository, never()).findAssignedSlotByApplicationId(11L);
    }

    @Test
    @DisplayName("ASSIGNED schedule 은 있지만 InterviewConfig.location 이 null 인 경우에도 interview 객체는 그대로 노출되고 location 만 null 이다 (Codex review BE-3)")
    void interviewExposedEvenWhenConfigLocationIsNull() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("지원자");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("hong@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(3L);
        when(recruitment.getTitle()).thenReturn("면접 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitment.isUseInterview()).thenReturn(true);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(15L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 9, 0));

        // ASSIGNED schedule + slot 은 존재. config 는 있지만 location 은 null.
        InterviewSchedule schedule = mock(InterviewSchedule.class);
        when(schedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(schedule.getSlotId()).thenReturn(101L);
        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getStartTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 0));
        when(slot.getEndTime()).thenReturn(LocalDateTime.of(2026, 6, 20, 14, 30));
        InterviewConfig config = mock(InterviewConfig.class);
        when(config.getLocation()).thenReturn(null);
        when(config.getAvailabilityDeadline()).thenReturn(LocalDateTime.of(2026, 6, 15, 18, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(15L)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(15L))
                .thenReturn(List.of());
        when(interviewScheduleRepository.findAssignedSlotByApplicationId(15L))
                .thenReturn(Optional.empty());
        when(interviewConfigRepository.findByRecruitmentId(3L)).thenReturn(Optional.of(config));
        when(interviewScheduleRepository.findByApplicationId(15L)).thenReturn(Optional.of(schedule));
        when(interviewSlotRepository.findById(101L)).thenReturn(Optional.of(slot));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(15L, 99L);

        assertThat(detail.interview()).isNotNull();
        assertThat(detail.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 14, 0));
        assertThat(detail.interview().endAt()).isEqualTo(LocalDateTime.of(2026, 6, 20, 14, 30));
        assertThat(detail.interview().location()).isNull();
    }

    @Test
    @DisplayName("ASSIGNED schedule 은 있지만 InterviewConfig 자체가 없는 경우에도 interview 객체는 그대로 노출되고 location 만 null 이다")
    void interviewExposedEvenWhenConfigIsAbsent() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("지원자");
        when(applicant.getStudentId()).thenReturn("20251234");
        when(applicant.getEmail()).thenReturn("hong@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(7L);
        when(recruitment.getTitle()).thenReturn("면접 모집(config 없음)");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.EXTERNAL);
        when(recruitment.isUseInterview()).thenReturn(true);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(16L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of());
        when(application.getStatus()).thenReturn(ApplicationStatus.INTERVIEW_PENDING);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 9, 0));

        InterviewSchedule schedule = mock(InterviewSchedule.class);
        when(schedule.getStatus()).thenReturn(InterviewScheduleStatus.ASSIGNED);
        when(schedule.getSlotId()).thenReturn(201L);
        InterviewSlot slot = mock(InterviewSlot.class);
        when(slot.getStartTime()).thenReturn(LocalDateTime.of(2026, 6, 21, 10, 0));
        when(slot.getEndTime()).thenReturn(LocalDateTime.of(2026, 6, 21, 10, 30));

        when(applicationRepository.findWithRecruitmentAndClubById(16L)).thenReturn(Optional.of(application));
        when(interviewAvailabilityRepository.findAvailabilityItemsByApplicationId(16L))
                .thenReturn(List.of());
        when(interviewScheduleRepository.findAssignedSlotByApplicationId(16L))
                .thenReturn(Optional.empty());
        when(interviewConfigRepository.findByRecruitmentId(7L)).thenReturn(Optional.empty());
        when(interviewScheduleRepository.findByApplicationId(16L)).thenReturn(Optional.of(schedule));
        when(interviewSlotRepository.findById(201L)).thenReturn(Optional.of(slot));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(16L, 99L);

        assertThat(detail.interview()).isNotNull();
        assertThat(detail.interview().startAt()).isEqualTo(LocalDateTime.of(2026, 6, 21, 10, 0));
        assertThat(detail.interview().location()).isNull();
    }

    @Test
    @DisplayName("답변 수가 질문 수보다 적을 때 짧은 쪽 길이까지만 매핑되고 초과 질문은 무시된다")
    void answersLessThanQuestionsMapsByMinLength() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(20L);
        when(applicant.getName()).thenReturn("이영희");
        when(applicant.getStudentId()).thenReturn("20252222");
        when(applicant.getEmail()).thenReturn("lee@example.com");

        Club club = mock(Club.class);
        when(club.getId()).thenReturn(5L);
        when(club.getName()).thenReturn("두잉 동아리");

        // 질문 3개, 답변 1개 — 짧은 쪽(답변) 길이만큼만 매핑되어야 함
        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(List.of("지원 동기는?", "여분 질문 1", "여분 질문 2"));

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(5L);
        when(recruitment.getTitle()).thenReturn("2026 테스트 모집");
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getForm()).thenReturn(form);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(4L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("동기 답변"));
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 11, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(4L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(4L, 99L);

        // 답변 1개까지만 매핑, 초과 질문 2개는 무시됨
        assertThat(detail.answers()).hasSize(1);
        assertThat(detail.answers().get(0).question()).isEqualTo("지원 동기는?");
        assertThat(detail.answers().get(0).answer()).isEqualTo("동기 답변");
    }
}
