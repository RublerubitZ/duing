package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.service.dto.query.ApplicantDetailQuery;
import com.duing.domain.club.entity.Club;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
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

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService);

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

        LocalDateTime interviewAt = LocalDateTime.of(2026, 6, 1, 14, 0);
        LocalDateTime submittedAt = LocalDateTime.of(2026, 5, 15, 10, 0);

        Application application = mock(Application.class);
        when(application.getId()).thenReturn(1L);
        when(application.getUser()).thenReturn(applicant);
        when(application.getRecruitment()).thenReturn(recruitment);
        when(application.getAnswers()).thenReturn(List.of("동아리에 관심이 많습니다.", "부회장을 목표로 합니다."));
        when(application.getStatus()).thenReturn(ApplicationStatus.SUBMITTED);
        when(application.getInterviewAt()).thenReturn(interviewAt);
        when(application.getInterviewLocation()).thenReturn("본관 201호");
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
        assertThat(detail.interviewAt()).isEqualTo(interviewAt);
        assertThat(detail.interviewLocation()).isEqualTo("본관 201호");
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
        when(application.getInterviewAt()).thenReturn(null);
        when(application.getInterviewLocation()).thenReturn(null);
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
        when(application.getInterviewAt()).thenReturn(null);
        when(application.getInterviewLocation()).thenReturn(null);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 11, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(3L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(3L, 99L);

        // 질문 1개까지만 매핑, 초과 답변 2개는 무시됨
        assertThat(detail.answers()).hasSize(1);
        assertThat(detail.answers().get(0).question()).isEqualTo("지원 동기는?");
        assertThat(detail.answers().get(0).answer()).isEqualTo("동기 답변");
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
        when(application.getInterviewAt()).thenReturn(null);
        when(application.getInterviewLocation()).thenReturn(null);
        when(application.getCreatedAt()).thenReturn(LocalDateTime.of(2026, 5, 16, 11, 0));

        when(applicationRepository.findWithRecruitmentAndClubById(4L)).thenReturn(Optional.of(application));

        ApplicantDetailQuery detail = applicationService.getApplicantDetail(4L, 99L);

        // 답변 1개까지만 매핑, 초과 질문 2개는 무시됨
        assertThat(detail.answers()).hasSize(1);
        assertThat(detail.answers().get(0).question()).isEqualTo("지원 동기는?");
        assertThat(detail.answers().get(0).answer()).isEqualTo("동기 답변");
    }
}
