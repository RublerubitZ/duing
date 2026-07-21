package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.repository.ClubRepository;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.entity.RecruitmentForm;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand;
import com.duing.domain.recruitment.service.dto.command.QuestionItemCommand.ChoiceItemCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;

/**
 * 수정 경로의 questionItems 해석 — id 왕복(기존 id 재생성 금지), 미지 id 거부,
 * 지원자 존재 시 질문 정의 불변 가드(#603 확장)를 실코드로 검증한다.
 */
class RecruitmentQuestionItemsUpdateTest {

    private final RecruitmentRepository recruitmentRepository = mock(RecruitmentRepository.class);
    private final ApplicationRepository applicationRepository = mock(ApplicationRepository.class);
    private final ClubRepository clubRepository = mock(ClubRepository.class);
    private final ClubAuthService clubAuthService = mock(ClubAuthService.class);
    private final ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);

    private final GeneralRecruitmentService recruitmentService = new GeneralRecruitmentService(
            recruitmentRepository,
            applicationRepository,
            clubRepository,
            clubAuthService,
            eventPublisher,
            // 실제 빈(seoulClock)과 동일한 Asia/Seoul 존 — systemDefaultZone 은 환경 의존.
            Clock.system(ZoneId.of("Asia/Seoul"))
    );

    private static final Long MANAGER_USER_ID = 1L;
    private static final Long RECRUITMENT_ID = 10L;
    private static final Long CLUB_ID = 100L;

    private Club club;

    @BeforeEach
    void setUp() {
        club = Club.create("두잉 동아리", ClubCategory.ACADEMIC, "공과대학", "설명", null);
        setField(club, "id", CLUB_ID);
    }

    private Recruitment selfRecruitmentWith(List<RecruitmentQuestion> questions) {
        Recruitment recruitment = Recruitment.create(
                club, "2026 봄 모집", "내용", LocalDate.now(), LocalDate.now().plusDays(14), 10);
        setField(recruitment, "id", RECRUITMENT_ID);
        recruitment.attachForm(RecruitmentForm.create(recruitment, questions));
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));
        return recruitment;
    }

    private static UpdateRecruitmentCommand withQuestionItems(List<QuestionItemCommand> questionItems) {
        return new UpdateRecruitmentCommand(
                RECRUITMENT_ID, MANAGER_USER_ID, null, null, null, null, null, null,
                null,
                questionItems,
                null, null, null);
    }

    private static UpdateRecruitmentCommand withLegacyQuestions(List<String> questions) {
        return new UpdateRecruitmentCommand(
                RECRUITMENT_ID, MANAGER_USER_ID, null, null, null, null, null, null,
                questions,
                null,
                null, null, null);
    }

    private static QuestionItemCommand textItem(String id, String text, boolean required) {
        return new QuestionItemCommand(id, text, QuestionType.TEXT, required, List.of());
    }

    private static QuestionItemCommand choiceItem(
            String id, String text, QuestionType type, List<ChoiceItemCommand> choices) {
        return new QuestionItemCommand(id, text, type, true, choices);
    }

    private static ChoiceItemCommand sameChoice(QuestionChoice choice) {
        return new ChoiceItemCommand(choice.id(), choice.label());
    }

    private static QuestionItemCommand unchanged(RecruitmentQuestion question) {
        return new QuestionItemCommand(question.id(), question.text(), question.type(), question.required(),
                question.choices().stream().map(RecruitmentQuestionItemsUpdateTest::sameChoice).toList());
    }

    private static List<RecruitmentQuestion> storedQuestions(Recruitment recruitment) {
        return recruitment.getForm().getQuestions();
    }

    private static void assertIsUuid(String value) {
        assertThatCode(() -> UUID.fromString(value)).doesNotThrowAnyException();
    }

    private static void setField(Object target, String fieldName, Object value) {
        try {
            Class<?> clazz = target.getClass();
            while (clazz != null) {
                try {
                    Field field = clazz.getDeclaredField(fieldName);
                    field.setAccessible(true);
                    field.set(target, value);
                    return;
                } catch (NoSuchFieldException notOnThisClass) {
                    clazz = clazz.getSuperclass();
                }
            }
            throw new RuntimeException("필드를 찾을 수 없습니다: " + fieldName);
        } catch (IllegalAccessException inaccessible) {
            throw new RuntimeException(inaccessible);
        }
    }

    @Test
    @DisplayName("수정 시 id 를 보존해 보낸 기존 질문은 id 가 재생성되지 않는다")
    void updatePreservesExistingQuestionAndChoiceIds() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, frontend));
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, fieldQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(0L);

        recruitmentService.update(withQuestionItems(List.of(
                textItem(motiveQuestion.id(), "지원 동기를 알려주세요", false),
                choiceItem(fieldQuestion.id(), "관심 분야를 골라주세요", QuestionType.MULTIPLE_CHOICE, List.of(
                        new ChoiceItemCommand(backend.id(), "서버"),
                        new ChoiceItemCommand(frontend.id(), "웹"))))));

        List<RecruitmentQuestion> stored = storedQuestions(recruitment);
        assertThat(stored).extracting(RecruitmentQuestion::id)
                .containsExactly(motiveQuestion.id(), fieldQuestion.id());
        assertThat(stored.get(0).text()).isEqualTo("지원 동기를 알려주세요");
        assertThat(stored.get(0).required()).isFalse();
        assertThat(stored.get(1).type()).isEqualTo(QuestionType.MULTIPLE_CHOICE);
        assertThat(stored.get(1).choices()).extracting(QuestionChoice::id)
                .containsExactly(backend.id(), frontend.id());
        assertThat(stored.get(1).choices()).extracting(QuestionChoice::label)
                .containsExactly("서버", "웹");
    }

    @Test
    @DisplayName("수정 시 현재 폼에 없는 질문 id 를 보내면 400 으로 거부된다")
    void updateWithUnknownQuestionIdIsRejected() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                textItem(UUID.randomUUID().toString(), "다른 질문", true)))))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("존재하지 않는 질문 id");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion);
    }

    @Test
    @DisplayName("수정 시 다른 질문의 선택지 id 를 보내면 400 으로 거부된다")
    void updateWithChoiceIdFromAnotherQuestionIsRejected() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, frontend));
        QuestionChoice morning = QuestionChoice.create("오전");
        QuestionChoice evening = QuestionChoice.create("저녁");
        RecruitmentQuestion timeQuestion = RecruitmentQuestion.create(
                "가능 시간대는?", QuestionType.MULTIPLE_CHOICE, true, List.of(morning, evening));
        Recruitment recruitment = selfRecruitmentWith(List.of(fieldQuestion, timeQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                unchanged(fieldQuestion),
                choiceItem(timeQuestion.id(), "가능 시간대는?", QuestionType.MULTIPLE_CHOICE, List.of(
                        sameChoice(morning),
                        new ChoiceItemCommand(backend.id(), "저녁")))))))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("존재하지 않는 선택지 id");
        assertThat(storedQuestions(recruitment)).containsExactly(fieldQuestion, timeQuestion);
    }

    @Test
    @DisplayName("id 없는 신규 질문과 선택지에는 새 id 가 발급된다")
    void updateIssuesNewIdsForItemsWithoutId() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(0L);

        recruitmentService.update(withQuestionItems(List.of(
                unchanged(motiveQuestion),
                choiceItem(null, "관심 분야는?", QuestionType.SINGLE_CHOICE, List.of(
                        new ChoiceItemCommand(null, "백엔드"),
                        new ChoiceItemCommand(null, "프론트엔드"))))));

        List<RecruitmentQuestion> stored = storedQuestions(recruitment);
        assertThat(stored).hasSize(2);
        assertThat(stored.get(0).id()).isEqualTo(motiveQuestion.id());
        RecruitmentQuestion newQuestion = stored.get(1);
        assertIsUuid(newQuestion.id());
        assertThat(newQuestion.id()).isNotEqualTo(motiveQuestion.id());
        newQuestion.choices().forEach(choice -> assertIsUuid(choice.id()));
        assertThat(newQuestion.choices().get(0).id()).isNotEqualTo(newQuestion.choices().get(1).id());
    }

    @Test
    @DisplayName("지원자가 있으면 선택지 라벨 변경도 409 로 차단된다")
    void choiceLabelChangeWithApplicationsIsBlocked() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, frontend));
        Recruitment recruitment = selfRecruitmentWith(List.of(fieldQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(2L);

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                choiceItem(fieldQuestion.id(), "관심 분야는?", QuestionType.SINGLE_CHOICE, List.of(
                        new ChoiceItemCommand(backend.id(), "서버"),
                        sameChoice(frontend)))))))
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
        assertThat(storedQuestions(recruitment).get(0).choices()).extracting(QuestionChoice::label)
                .containsExactly("백엔드", "프론트엔드");
    }

    @Test
    @DisplayName("지원자가 있으면 질문 순서 변경도 409 로 차단된다")
    void questionReorderWithApplicationsIsBlocked() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion skillQuestion = RecruitmentQuestion.createText("특기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, skillQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(1L);

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                unchanged(skillQuestion), unchanged(motiveQuestion)))))
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, skillQuestion);
    }

    @Test
    @DisplayName("지원자가 있으면 질문 필수 여부 변경도 409 로 차단된다")
    void requiredFlagChangeWithApplicationsIsBlocked() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        selfRecruitmentWith(List.of(motiveQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(1L);

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                textItem(motiveQuestion.id(), "지원 동기는?", false)))))
                .isInstanceOf(RecruitmentException.QuestionsNotEditableWithApplicationsException.class);
    }

    @Test
    @DisplayName("지원자가 있어도 완전히 동일한 questionItems 재전송은 허용된다")
    void resubmittingIdenticalQuestionItemsWithApplicationsSucceeds() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, frontend));
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, fieldQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(2L);

        recruitmentService.update(withQuestionItems(List.of(
                unchanged(motiveQuestion), unchanged(fieldQuestion))));

        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, fieldQuestion);
        // 질문이 바뀌지 않았으므로 지원자 수 조회 자체를 건너뛴다.
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("지원자가 있어도 완전히 동일한 legacy questions 재전송은 허용된다")
    void resubmittingIdenticalLegacyQuestionsWithApplicationsSucceeds() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion skillQuestion = RecruitmentQuestion.createText("특기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, skillQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(3L);

        recruitmentService.update(withLegacyQuestions(List.of("지원 동기는?", "특기는?")));

        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, skillQuestion);
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("선택형 질문이 있는 폼을 legacy questions 로 수정하려 하면 400 으로 거부된다")
    void legacyQuestionsCannotOverwriteChoiceQuestions() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("백엔드"), QuestionChoice.create("프론트엔드")));
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, fieldQuestion));

        assertThatThrownBy(() -> recruitmentService.update(
                withLegacyQuestions(List.of("지원 동기는?", "관심 분야는?", "추가 질문"))))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("구 버전 형식");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, fieldQuestion);
    }

    @Test
    @DisplayName("선택형 질문이 있어도 legacy questions 를 텍스트 그대로 재전송하면 no-op 으로 허용된다")
    void legacyQuestionsIdenticalToChoiceFormTextsIsNoOp() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true,
                List.of(QuestionChoice.create("백엔드"), QuestionChoice.create("프론트엔드")));
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, fieldQuestion));

        recruitmentService.update(withLegacyQuestions(List.of("지원 동기는?", "관심 분야는?")));

        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, fieldQuestion);
    }

    @Test
    @DisplayName("legacy 필수 주관식 질문만 있는 폼은 legacy questions 로 계속 수정할 수 있다")
    void legacyQuestionsStillEditableOnLegacyShapeForm() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(0L);

        recruitmentService.update(withLegacyQuestions(List.of("새 질문1", "새 질문2")));

        assertThat(storedQuestions(recruitment)).extracting(RecruitmentQuestion::text)
                .containsExactly("새 질문1", "새 질문2");
    }

    @Test
    @DisplayName("수정 시 questions 와 questionItems 를 함께 보내면 400 으로 거부된다")
    void updateWithBothQuestionsAndQuestionItemsIsRejected() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        selfRecruitmentWith(List.of(motiveQuestion));

        UpdateRecruitmentCommand bothCommand = new UpdateRecruitmentCommand(
                RECRUITMENT_ID, MANAGER_USER_ID, null, null, null, null, null, null,
                List.of("지원 동기는?"),
                List.of(textItem(null, "지원 동기는?", true)),
                null, null, null);

        assertThatThrownBy(() -> recruitmentService.update(bothCommand))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("함께 보낼 수 없습니다");
    }

    @Test
    @DisplayName("수정 요청에 같은 질문 id 를 두 번 보내면 400 으로 거부된다")
    void updateWithDuplicateQuestionIdIsRejected() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                textItem(motiveQuestion.id(), "질문A", true),
                textItem(motiveQuestion.id(), "질문B", true)))))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("질문 id 가 중복");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion);
    }

    @Test
    @DisplayName("수정 시 선택형 질문의 선택지를 1개로 줄이면 400 으로 거부된다")
    void updateChoiceQuestionDownToSingleChoiceIsRejected() {
        QuestionChoice backend = QuestionChoice.create("백엔드");
        QuestionChoice frontend = QuestionChoice.create("프론트엔드");
        RecruitmentQuestion fieldQuestion = RecruitmentQuestion.create(
                "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(backend, frontend));
        selfRecruitmentWith(List.of(fieldQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                choiceItem(fieldQuestion.id(), "관심 분야는?", QuestionType.SINGLE_CHOICE,
                        List.of(sameChoice(backend)))))))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("2개 이상");
    }

    @Test
    @DisplayName("자체 폼 모집의 질문을 questionItems 빈 배열로 모두 지우려 하면 400 으로 거부된다")
    void clearingAllQuestionsWithEmptyQuestionItemsIsRejected() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of())))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion);
        // 성공할 수 없는 요청이라 행 잠금·지원자 수 조회에 도달하지 않는다.
        verify(recruitmentRepository, never()).lockFormForQuestionChange(RECRUITMENT_ID);
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("자체 폼 모집의 질문을 legacy questions 빈 배열로 모두 지우려 하면 400 으로 거부된다")
    void clearingAllQuestionsWithEmptyLegacyQuestionsIsRejected() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));

        assertThatThrownBy(() -> recruitmentService.update(withLegacyQuestions(List.of())))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion);
        verify(recruitmentRepository, never()).lockFormForQuestionChange(RECRUITMENT_ID);
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("지원자가 있어도 질문을 빈 배열로 지우려는 요청은 409 가 아니라 400 으로 거부된다")
    void clearingAllQuestionsWithApplicationsIsRejectedAsBadRequest() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion));
        when(applicationRepository.countByRecruitmentId(RECRUITMENT_ID)).thenReturn(3L);

        // 지원자를 지우면 통과한다는 잘못된 신호(409)를 주지 않도록, 요청 자체의 무효를 먼저 알린다.
        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of())))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class)
                .hasMessageContaining("자체 폼 모집은 최소 1개 이상의 질문이 필요합니다.");
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion);
    }

    @Test
    @DisplayName("질문을 보내지 않는 부분 갱신은 기존 질문에 영향을 주지 않는다")
    void partialUpdateWithoutQuestionsKeepsExistingQuestions() {
        RecruitmentQuestion motiveQuestion = RecruitmentQuestion.createText("지원 동기는?");
        RecruitmentQuestion skillQuestion = RecruitmentQuestion.createText("특기는?");
        Recruitment recruitment = selfRecruitmentWith(List.of(motiveQuestion, skillQuestion));

        recruitmentService.update(new UpdateRecruitmentCommand(
                RECRUITMENT_ID, MANAGER_USER_ID, "새 제목", null, null, null, 30, null,
                null,
                null,
                null, null, null));

        assertThat(recruitment.getTitle()).isEqualTo("새 제목");
        assertThat(recruitment.getCapacity()).isEqualTo(30);
        assertThat(storedQuestions(recruitment)).containsExactly(motiveQuestion, skillQuestion);
        // 질문 변경 경로에 진입하지 않으므로 행 잠금·지원자 수 조회도 일어나지 않는다.
        verify(recruitmentRepository, never()).lockFormForQuestionChange(RECRUITMENT_ID);
        verify(applicationRepository, never()).countByRecruitmentId(RECRUITMENT_ID);
    }

    @Test
    @DisplayName("외부 폼 모집에 questionItems 를 전달하면 400 예외가 발생한다")
    void updateExternalRecruitmentWithQuestionItemsIsRejected() {
        Recruitment recruitment = Recruitment.create(
                club, "2026 봄 모집", "내용", LocalDate.now(), LocalDate.now().plusDays(14), 10);
        setField(recruitment, "id", RECRUITMENT_ID);
        setField(recruitment, "applicationMode", ApplicationMode.EXTERNAL);
        when(recruitmentRepository.findById(RECRUITMENT_ID)).thenReturn(Optional.of(recruitment));

        assertThatThrownBy(() -> recruitmentService.update(withQuestionItems(List.of(
                textItem(null, "지원 동기는?", true)))))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }
}
