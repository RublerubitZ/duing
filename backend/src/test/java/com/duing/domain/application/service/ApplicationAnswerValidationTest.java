package com.duing.domain.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.entity.Application;
import com.duing.domain.application.entity.ApplicationAnswer;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.exception.ApplicationDomainException;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.application.repository.ApplicationStatusHistoryRepository;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand;
import com.duing.domain.application.service.dto.command.SubmitApplicationCommand.AnswerItem;
import com.duing.domain.application.service.dto.query.ApplicantQuery;
import com.duing.domain.application.service.dto.query.ApplicantRowQuery;
import com.duing.domain.application.service.dto.query.ApplicantSearchCondition;
import com.duing.domain.applicationEvaluation.repository.ApplicationEvaluationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.repository.ClubMemberRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.clubmember.service.ClubMemberEnrollmentService;
import com.duing.domain.draft.service.ApplicationDraftService;
import com.duing.domain.interview.repository.InterviewAvailabilityRepository;
import com.duing.domain.interview.repository.InterviewRoundMemberRepositoryCustom;
import com.duing.domain.interview.repository.InterviewRoundRepository;
import com.duing.domain.interview.repository.InterviewScheduleRepository;
import com.duing.domain.interview.repository.InterviewSlotRepository;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.entity.TargetRole;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.User;
import com.duing.domain.user.repository.UserRepository;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

/**
 * 스펙 §2.5·§2.6 — answerItems 제출 통로와 질문 유형별 답변 검증 매트릭스.
 * 실제 GeneralApplicationService 를 구동하며 repository 만 mock 으로 대체한다.
 */
class ApplicationAnswerValidationTest {

    private static final Long RECRUITMENT_ID = 1L;
    private static final Long USER_ID = 10L;
    private static final Long CLUB_ID = 99L;
    private static final String REQUIRED_ANSWER_MISSING_MESSAGE = "필수 질문에 답변을 입력해주세요.";
    private static final String INVALID_CHOICE_MESSAGE = "유효하지 않은 선택지입니다.";

    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final UserRepository userRepository = mock(UserRepository.class);
    private final ClubMemberRepository clubMemberRepository = mock(ClubMemberRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ClubMemberEnrollmentService clubMemberEnrollmentService = mock(ClubMemberEnrollmentService.class);
    private final ApplicationDraftService applicationDraftService = mock(ApplicationDraftService.class);
    private final ApplicationStatusHistoryRepository applicationStatusHistoryRepository =
            mock(ApplicationStatusHistoryRepository.class);
    private final ApplicationEvaluationRepository applicationEvaluationRepository =
            mock(ApplicationEvaluationRepository.class);
    private final InterviewAvailabilityRepository interviewAvailabilityRepository =
            mock(InterviewAvailabilityRepository.class);
    private final InterviewScheduleRepository interviewScheduleRepository = mock(InterviewScheduleRepository.class);
    private final InterviewRoundRepository interviewRoundRepository = mock(InterviewRoundRepository.class);
    private final InterviewSlotRepository interviewSlotRepository = mock(InterviewSlotRepository.class);
    private final InterviewRoundMemberRepositoryCustom interviewRoundMemberRepository =
            mock(InterviewRoundMemberRepositoryCustom.class);
    private final Clock clock = Clock.systemDefaultZone();

    private final GeneralApplicationService applicationService = new GeneralApplicationService(
            applicationRepository,
            recruitmentRepository,
            userRepository,
            clubMemberRepository,
            clubAuthService,
            clubMemberEnrollmentService,
            applicationDraftService,
            applicationStatusHistoryRepository,
            applicationEvaluationRepository,
            interviewAvailabilityRepository,
            interviewScheduleRepository,
            interviewRoundRepository,
            interviewSlotRepository,
            interviewRoundMemberRepository,
            clock);

    // ── payload 분기 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("answers 와 answerItems 를 함께 보내면 400 으로 거부된다")
    void submittingBothAnswerPayloadsIsRejected() {
        assertThatThrownBy(() -> new SubmitApplicationCommand(
                RECRUITMENT_ID, USER_ID, List.of("답변"), List.of(new AnswerItem("question-1", List.of("답변")))))
                .isInstanceOf(ApplicationDomainException.InvalidAnswerPayloadException.class)
                .hasMessage("answers 와 answerItems 는 함께 보낼 수 없습니다.")
                .extracting(failure -> ((ApplicationDomainException) failure).getStatus())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("answers 와 answerItems 를 모두 보내지 않으면 400 으로 거부된다")
    void submittingNeitherAnswerPayloadIsRejected() {
        // 빈 바디 `{}` 가 이 경로로 들어온다 — 과거 answers 의 @NotNull 이 담당하던 400 을 커맨드가 이어받는다.
        assertThatThrownBy(() -> new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, null, null))
                .isInstanceOf(ApplicationDomainException.InvalidAnswerPayloadException.class)
                .hasMessage("답변 목록은 필수 입력값입니다.")
                .extracting(failure -> ((ApplicationDomainException) failure).getStatus())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // ── 질문·답변 1:1 대응 ────────────────────────────────────────────────────

    @Test
    @DisplayName("폼에 없는 questionId 로 제출하면 400 으로 거부된다")
    void unknownQuestionIdIsRejected() {
        RecruitmentQuestion question = requiredTextQuestion("지원 동기는?");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem("존재하지-않는-질문", List.of("답변")))))
                .isInstanceOf(ApplicationDomainException.InvalidAnswersException.class);
    }

    @Test
    @DisplayName("같은 questionId 를 두 번 보내면 400 으로 거부된다")
    void duplicateQuestionIdIsRejected() {
        RecruitmentQuestion firstQuestion = requiredTextQuestion("지원 동기는?");
        RecruitmentQuestion secondQuestion = requiredTextQuestion("장기 목표는?");
        stubOpenRecruitmentWithQuestions(List.of(firstQuestion, secondQuestion));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(answerItemsCommand(
                new AnswerItem(firstQuestion.id(), List.of("첫 답변")),
                new AnswerItem(firstQuestion.id(), List.of("또 첫 답변")))))
                .isInstanceOf(ApplicationDomainException.InvalidAnswersException.class);
    }

    @Test
    @DisplayName("질문 하나를 누락하고 제출하면 400 으로 거부된다")
    void missingQuestionAnswerIsRejected() {
        RecruitmentQuestion firstQuestion = requiredTextQuestion("지원 동기는?");
        RecruitmentQuestion secondQuestion = requiredTextQuestion("장기 목표는?");
        stubOpenRecruitmentWithQuestions(List.of(firstQuestion, secondQuestion));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(firstQuestion.id(), List.of("첫 답변")))))
                .isInstanceOf(ApplicationDomainException.InvalidAnswersException.class);
    }

    // ── TEXT ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("필수 주관식에 공백만 입력하면 400 과 필수 답변 안내를 받는다")
    void blankAnswerToRequiredTextQuestionIsRejected() {
        RecruitmentQuestion question = requiredTextQuestion("지원 동기는?");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of("   ")))))
                .isInstanceOf(ApplicationDomainException.RequiredAnswerMissingException.class)
                .hasMessage(REQUIRED_ANSWER_MISSING_MESSAGE);
    }

    @Test
    @DisplayName("선택 주관식은 빈 값으로 제출할 수 있다")
    void optionalTextQuestionAcceptsEmptyValues() {
        RecruitmentQuestion question = optionalTextQuestion("하고 싶은 말이 있나요?");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatCode(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of()))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("주관식에 값을 2개 보내면 400 으로 거부된다")
    void textQuestionWithMultipleValuesIsRejected() {
        RecruitmentQuestion question = requiredTextQuestion("지원 동기는?");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of("첫 답변", "둘째 답변")))))
                .isInstanceOf(ApplicationDomainException.InvalidAnswersException.class);
    }

    // ── SINGLE_CHOICE ───────────────────────────────────────────────────────

    @Test
    @DisplayName("필수 단일 선택을 고르지 않으면 400 과 필수 답변 안내를 받는다")
    void requiredSingleChoiceWithoutSelectionIsRejected() {
        RecruitmentQuestion question = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of()))))
                .isInstanceOf(ApplicationDomainException.RequiredAnswerMissingException.class)
                .hasMessage(REQUIRED_ANSWER_MISSING_MESSAGE);
    }

    @Test
    @DisplayName("단일 선택에 2개를 고르면 400 유효하지 않은 선택지 안내를 받는다")
    void singleChoiceWithTwoSelectionsIsRejected() {
        RecruitmentQuestion question = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(answerItemsCommand(new AnswerItem(
                question.id(), List.of(choiceIdAt(question, 0), choiceIdAt(question, 1))))))
                .isInstanceOf(ApplicationDomainException.InvalidChoiceSelectionException.class)
                .hasMessage(INVALID_CHOICE_MESSAGE);
    }

    @Test
    @DisplayName("다른 질문의 선택지 id 로 제출하면 400 으로 거부된다")
    void choiceIdBorrowedFromAnotherQuestionIsRejected() {
        RecruitmentQuestion firstQuestion = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        RecruitmentQuestion secondQuestion = singleChoiceQuestion("주 활동 시간대는?", true, "오전", "오후");
        stubOpenRecruitmentWithQuestions(List.of(firstQuestion, secondQuestion));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(answerItemsCommand(
                new AnswerItem(firstQuestion.id(), List.of(choiceIdAt(secondQuestion, 0))),
                new AnswerItem(secondQuestion.id(), List.of(choiceIdAt(secondQuestion, 0))))))
                .isInstanceOf(ApplicationDomainException.InvalidChoiceSelectionException.class)
                .hasMessage(INVALID_CHOICE_MESSAGE);
    }

    @Test
    @DisplayName("선택 단일 선택은 빈 값으로 제출할 수 있다")
    void optionalSingleChoiceAcceptsEmptyValues() {
        RecruitmentQuestion question = singleChoiceQuestion("주 활동 요일은?", false, "월요일", "화요일");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatCode(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of()))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("존재하지 않는 선택지 id 로 제출하면 400 으로 거부된다")
    void unknownChoiceIdIsRejected() {
        RecruitmentQuestion question = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of("존재하지-않는-선택지")))))
                .isInstanceOf(ApplicationDomainException.InvalidChoiceSelectionException.class)
                .hasMessage(INVALID_CHOICE_MESSAGE);
    }

    // ── MULTIPLE_CHOICE ─────────────────────────────────────────────────────

    @Test
    @DisplayName("필수 복수 선택을 하나도 고르지 않으면 400 과 필수 답변 안내를 받는다")
    void requiredMultipleChoiceWithoutSelectionIsRejected() {
        RecruitmentQuestion question = multipleChoiceQuestion("관심 분야는?", true, "백엔드", "프론트엔드");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of()))))
                .isInstanceOf(ApplicationDomainException.RequiredAnswerMissingException.class)
                .hasMessage(REQUIRED_ANSWER_MISSING_MESSAGE);
    }

    @Test
    @DisplayName("복수 선택에서 같은 선택지를 중복 제출하면 400 으로 거부된다")
    void duplicateChoiceIdInMultipleChoiceIsRejected() {
        RecruitmentQuestion question = multipleChoiceQuestion("관심 분야는?", true, "백엔드", "프론트엔드");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(answerItemsCommand(new AnswerItem(
                question.id(), List.of(choiceIdAt(question, 0), choiceIdAt(question, 0))))))
                .isInstanceOf(ApplicationDomainException.InvalidChoiceSelectionException.class)
                .hasMessage(INVALID_CHOICE_MESSAGE);
    }

    @Test
    @DisplayName("선택 복수 선택은 빈 값으로 제출할 수 있다")
    void optionalMultipleChoiceAcceptsEmptyValues() {
        RecruitmentQuestion question = multipleChoiceQuestion("관심 분야는?", false, "백엔드", "프론트엔드");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        assertThatCode(() -> applicationService.submit(
                answerItemsCommand(new AnswerItem(question.id(), List.of()))))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("정상 복수 선택 제출은 선택지 id 들이 그대로 저장된다")
    void validMultipleChoiceSubmissionStoresChoiceIds() {
        RecruitmentQuestion question = multipleChoiceQuestion("관심 분야는?", true, "백엔드", "프론트엔드", "디자인");
        stubOpenRecruitmentWithQuestions(List.of(question));
        stubApplicantWithoutMembership();

        applicationService.submit(answerItemsCommand(new AnswerItem(
                question.id(), List.of(choiceIdAt(question, 0), choiceIdAt(question, 2)))));

        ArgumentCaptor<Application> savedApplication = ArgumentCaptor.forClass(Application.class);
        verify(applicationRepository).save(savedApplication.capture());
        List<ApplicationAnswer> storedAnswers = savedApplication.getValue().getAnswers();
        assertThat(storedAnswers).hasSize(1);
        assertThat(storedAnswers.get(0).questionId()).isEqualTo(question.id());
        assertThat(storedAnswers.get(0).values())
                .containsExactly(choiceIdAt(question, 0), choiceIdAt(question, 2));
    }

    // ── legacy answers 통로 ──────────────────────────────────────────────────

    @Test
    @DisplayName("전 질문이 주관식인 폼은 legacy answers 로 계속 제출할 수 있다")
    void textOnlyFormStillAcceptsLegacyAnswers() {
        RecruitmentQuestion firstQuestion = requiredTextQuestion("지원 동기는?");
        RecruitmentQuestion secondQuestion = requiredTextQuestion("장기 목표는?");
        stubOpenRecruitmentWithQuestions(List.of(firstQuestion, secondQuestion));
        stubApplicantWithoutMembership();

        applicationService.submit(new SubmitApplicationCommand(
                RECRUITMENT_ID, USER_ID, List.of("동아리에 관심이 많습니다.", "부회장을 목표로 합니다."), null));

        ArgumentCaptor<Application> savedApplication = ArgumentCaptor.forClass(Application.class);
        verify(applicationRepository).save(savedApplication.capture());
        List<ApplicationAnswer> storedAnswers = savedApplication.getValue().getAnswers();
        assertThat(storedAnswers).extracting(ApplicationAnswer::questionId)
                .containsExactly(firstQuestion.id(), secondQuestion.id());
        assertThat(storedAnswers.get(0).values()).containsExactly("동아리에 관심이 많습니다.");
        assertThat(storedAnswers.get(1).values()).containsExactly("부회장을 목표로 합니다.");
    }

    @Test
    @DisplayName("선택형 질문이 있는 폼에 legacy answers 를 보내면 400 으로 거부된다")
    void formWithChoiceQuestionRejectsLegacyAnswers() {
        RecruitmentQuestion choiceQuestion = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        stubOpenRecruitmentWithQuestions(List.of(choiceQuestion));
        stubApplicantWithoutMembership();

        assertThatThrownBy(() -> applicationService.submit(new SubmitApplicationCommand(
                RECRUITMENT_ID, USER_ID, List.of("월요일"), null)))
                .isInstanceOf(ApplicationDomainException.InvalidChoiceSelectionException.class)
                .hasMessage(INVALID_CHOICE_MESSAGE);
    }

    // ── 운영진 지원자 목록 표시 ────────────────────────────────────────────────

    @Test
    @DisplayName("운영진 지원자 목록의 객관식 답변은 선택지 라벨로 표시된다")
    void applicantListShowsChoiceLabelsInsteadOfChoiceIds() {
        RecruitmentQuestion textQuestion = requiredTextQuestion("지원 동기는?");
        RecruitmentQuestion singleChoice = singleChoiceQuestion("주 활동 요일은?", true, "월요일", "화요일");
        RecruitmentQuestion multipleChoice = multipleChoiceQuestion("관심 분야는?", true, "백엔드", "프론트엔드");
        stubOpenRecruitmentWithQuestions(List.of(textQuestion, singleChoice, multipleChoice));

        ApplicantRowQuery row = new ApplicantRowQuery(
                1L, ApplicationStatus.SUBMITTED, LocalDateTime.now(),
                List.of(
                        new ApplicationAnswer(textQuestion.id(), List.of("동아리에 관심이 많습니다.")),
                        new ApplicationAnswer(singleChoice.id(), List.of(choiceIdAt(singleChoice, 1))),
                        new ApplicationAnswer(multipleChoice.id(),
                                List.of(choiceIdAt(multipleChoice, 0), choiceIdAt(multipleChoice, 1)))),
                USER_ID, "지원자", "20250001", College.IT_ENGINEERING, "컴퓨터공학과", Grade.FRESHMAN,
                null, null);
        ApplicantSearchCondition noFilter = new ApplicantSearchCondition(null, null, null, null, null);
        when(applicationRepository.searchApplicants(RECRUITMENT_ID, USER_ID, noFilter))
                .thenReturn(List.of(row));

        List<ApplicantQuery> applicants = applicationService.getApplicants(RECRUITMENT_ID, USER_ID, noFilter);

        assertThat(applicants).hasSize(1);
        assertThat(applicants.get(0).answers())
                .containsExactly("동아리에 관심이 많습니다.", "화요일", "백엔드, 프론트엔드");
    }

    // ── 픽스처 ───────────────────────────────────────────────────────────────

    private SubmitApplicationCommand answerItemsCommand(AnswerItem... answerItems) {
        return new SubmitApplicationCommand(RECRUITMENT_ID, USER_ID, null, List.of(answerItems));
    }

    private static RecruitmentQuestion requiredTextQuestion(String text) {
        return RecruitmentQuestion.create(text, QuestionType.TEXT, true, List.of());
    }

    private static RecruitmentQuestion optionalTextQuestion(String text) {
        return RecruitmentQuestion.create(text, QuestionType.TEXT, false, List.of());
    }

    private static RecruitmentQuestion singleChoiceQuestion(String text, boolean required, String... labels) {
        return RecruitmentQuestion.create(text, QuestionType.SINGLE_CHOICE, required, choicesOf(labels));
    }

    private static RecruitmentQuestion multipleChoiceQuestion(String text, boolean required, String... labels) {
        return RecruitmentQuestion.create(text, QuestionType.MULTIPLE_CHOICE, required, choicesOf(labels));
    }

    private static List<QuestionChoice> choicesOf(String... labels) {
        return java.util.Arrays.stream(labels).map(QuestionChoice::create).toList();
    }

    private static String choiceIdAt(RecruitmentQuestion question, int index) {
        return question.choices().get(index).id();
    }

    private Recruitment stubOpenRecruitmentWithQuestions(List<RecruitmentQuestion> questions) {
        Club club = mock(Club.class);
        when(club.getId()).thenReturn(CLUB_ID);
        when(club.getStatus()).thenReturn(ClubStatus.ACTIVE);

        RecruitmentForm form = mock(RecruitmentForm.class);
        when(form.getQuestions()).thenReturn(questions);

        Recruitment recruitment = mock(Recruitment.class);
        when(recruitment.getId()).thenReturn(RECRUITMENT_ID);
        when(recruitment.isEffectivelyOpen(any())).thenReturn(true);
        when(recruitment.getApplicationMode()).thenReturn(ApplicationMode.SELF);
        when(recruitment.getTargetRole()).thenReturn(TargetRole.MEMBER);
        when(recruitment.getClub()).thenReturn(club);
        when(recruitment.getForm()).thenReturn(form);

        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        return recruitment;
    }

    private void stubApplicantWithoutMembership() {
        User applicant = mock(User.class);
        when(applicant.getId()).thenReturn(USER_ID);
        when(userRepository.findById(USER_ID)).thenReturn(Optional.of(applicant));
        when(applicationRepository.existsByRecruitmentIdAndUserId(RECRUITMENT_ID, USER_ID)).thenReturn(false);
        when(clubMemberRepository.findByClubIdAndUserId(CLUB_ID, USER_ID)).thenReturn(Optional.empty());

        Application savedApplication = mock(Application.class);
        when(savedApplication.getId()).thenReturn(100L);
        when(applicationRepository.save(any(Application.class))).thenReturn(savedApplication);
    }
}
