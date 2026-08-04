package com.duing.domain.recruitment.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.recruitment.controller.dto.request.QuestionItemPayload.ChoiceItemPayload;
import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.QuestionChoice;
import com.duing.domain.recruitment.entity.QuestionType;
import com.duing.domain.recruitment.entity.RecruitmentQuestion;
import com.duing.domain.recruitment.exception.RecruitmentException;
import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 생성 경로의 questionItems 해석 — 요청 DTO 의 {@code toCommand} 와
 * {@link CreateRecruitmentCommand} compact constructor 의 {@code validateDefinitions} 를 실코드로 검증한다.
 */
class CreateRecruitmentRequestQuestionItemsTest {

    private static final Long CLUB_ID = 100L;
    private static final Long CURRENT_USER_ID = 1L;

    private static CreateRecruitmentRequest selfFormRequest(
            List<String> legacyQuestions, List<QuestionItemPayload> questionItems) {
        return new CreateRecruitmentRequest(
                "2026 봄 모집",
                "내용",
                LocalDate.now(),
                LocalDate.now().plusDays(14),
                10,
                ApplicationMode.SELF,
                null,
                null,
                null,
                legacyQuestions,
                questionItems,
                null,
                null,
                null
        );
    }

    private static void assertIsUuid(String value) {
        assertThatCode(() -> UUID.fromString(value)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("questionItems 로 선택형 질문을 생성하면 질문과 선택지에 id 가 발급된다")
    void createWithQuestionItemsIssuesIdsForQuestionsAndChoices() {
        CreateRecruitmentRequest request = selfFormRequest(null, List.of(
                new QuestionItemPayload(null, "지원 동기는?", QuestionType.TEXT, null, null),
                new QuestionItemPayload(null, "관심 분야는?", QuestionType.SINGLE_CHOICE, false, List.of(
                        new ChoiceItemPayload(null, "백엔드"),
                        new ChoiceItemPayload(null, "프론트엔드")))));

        CreateRecruitmentCommand command = request.toCommand(CLUB_ID, CURRENT_USER_ID);

        assertThat(command.questions()).hasSize(2);
        RecruitmentQuestion textQuestion = command.questions().get(0);
        assertIsUuid(textQuestion.id());
        assertThat(textQuestion.type()).isEqualTo(QuestionType.TEXT);
        // required 를 보내지 않으면 필수 질문이 기본값이다.
        assertThat(textQuestion.required()).isTrue();
        assertThat(textQuestion.choices()).isEmpty();

        RecruitmentQuestion choiceQuestion = command.questions().get(1);
        assertIsUuid(choiceQuestion.id());
        assertThat(choiceQuestion.id()).isNotEqualTo(textQuestion.id());
        assertThat(choiceQuestion.required()).isFalse();
        assertThat(choiceQuestion.choices()).extracting(QuestionChoice::label)
                .containsExactly("백엔드", "프론트엔드");
        choiceQuestion.choices().forEach(choice -> assertIsUuid(choice.id()));
        assertThat(choiceQuestion.choices().get(0).id()).isNotEqualTo(choiceQuestion.choices().get(1).id());
    }

    @Test
    @DisplayName("생성 시 클라이언트가 보낸 질문 id 는 무시되고 새 id 가 발급된다")
    void createIgnoresClientSuppliedIds() {
        CreateRecruitmentRequest request = selfFormRequest(null, List.of(
                new QuestionItemPayload("client-question-id", "관심 분야는?", QuestionType.SINGLE_CHOICE, true, List.of(
                        new ChoiceItemPayload("client-choice-id-1", "백엔드"),
                        new ChoiceItemPayload("client-choice-id-2", "프론트엔드")))));

        CreateRecruitmentCommand command = request.toCommand(CLUB_ID, CURRENT_USER_ID);

        RecruitmentQuestion question = command.questions().get(0);
        assertThat(question.id()).isNotEqualTo("client-question-id");
        assertIsUuid(question.id());
        assertThat(question.choices()).extracting(QuestionChoice::id)
                .doesNotContain("client-choice-id-1", "client-choice-id-2");
        question.choices().forEach(choice -> assertIsUuid(choice.id()));
    }

    @Test
    @DisplayName("생성 시 questions 와 questionItems 를 함께 보내면 400 으로 거부된다")
    void createWithBothQuestionsAndQuestionItemsIsRejected() {
        CreateRecruitmentRequest request = selfFormRequest(
                List.of("지원 동기는?"),
                List.of(new QuestionItemPayload(null, "지원 동기는?", QuestionType.TEXT, true, null)));

        assertThatThrownBy(() -> request.toCommand(CLUB_ID, CURRENT_USER_ID))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("함께 보낼 수 없습니다");
    }

    @Test
    @DisplayName("선택형 질문의 선택지가 1개면 400 으로 거부된다")
    void createChoiceQuestionWithSingleChoiceIsRejected() {
        CreateRecruitmentRequest request = selfFormRequest(null, List.of(
                new QuestionItemPayload(null, "관심 분야는?", QuestionType.SINGLE_CHOICE, true,
                        List.of(new ChoiceItemPayload(null, "백엔드")))));

        assertThatThrownBy(() -> request.toCommand(CLUB_ID, CURRENT_USER_ID))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("2개 이상");
    }

    @Test
    @DisplayName("주관식 질문에 선택지가 있으면 400 으로 거부된다")
    void createTextQuestionWithChoicesIsRejected() {
        CreateRecruitmentRequest request = selfFormRequest(null, List.of(
                new QuestionItemPayload(null, "지원 동기는?", QuestionType.TEXT, true,
                        List.of(new ChoiceItemPayload(null, "백엔드"), new ChoiceItemPayload(null, "프론트엔드")))));

        assertThatThrownBy(() -> request.toCommand(CLUB_ID, CURRENT_USER_ID))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("주관식");
    }

    @Test
    @DisplayName("같은 질문의 선택지 내용이 중복되면 400 으로 거부된다")
    void createChoiceQuestionWithDuplicateLabelsIsRejected() {
        CreateRecruitmentRequest request = selfFormRequest(null, List.of(
                new QuestionItemPayload(null, "관심 분야는?", QuestionType.MULTIPLE_CHOICE, true, List.of(
                        new ChoiceItemPayload(null, "백엔드"),
                        new ChoiceItemPayload(null, " 백엔드 ")))));

        assertThatThrownBy(() -> request.toCommand(CLUB_ID, CURRENT_USER_ID))
                .isInstanceOf(RecruitmentException.InvalidQuestionDefinitionException.class)
                .hasMessageContaining("중복");
    }

    @Test
    @DisplayName("questionItems 없이 legacy questions 만 보내면 기존과 동일하게 주관식 필수 질문으로 승격된다")
    void createWithLegacyQuestionsStillPromotesToRequiredTextQuestions() {
        CreateRecruitmentRequest request = selfFormRequest(List.of("지원 동기는?", "특기는?"), null);

        CreateRecruitmentCommand command = request.toCommand(CLUB_ID, CURRENT_USER_ID);

        assertThat(command.questions()).extracting(RecruitmentQuestion::text)
                .containsExactly("지원 동기는?", "특기는?");
        assertThat(command.questions()).allSatisfy(question -> {
            assertIsUuid(question.id());
            assertThat(question.type()).isEqualTo(QuestionType.TEXT);
            assertThat(question.required()).isTrue();
            assertThat(question.choices()).isEmpty();
        });
    }

    @Test
    @DisplayName("외부 폼 모집에 questionItems 를 함께 보내면 400 으로 거부된다")
    void createExternalFormWithQuestionItemsIsRejected() {
        CreateRecruitmentRequest request = new CreateRecruitmentRequest(
                // EXTERNAL 은 안내문(content)·비허용 URL 도 거부하므로, questionItems 만 유일한 위반이 되게 둔다.
                "2026 봄 모집", null, LocalDate.now(), LocalDate.now().plusDays(14), 10,
                ApplicationMode.EXTERNAL, "https://forms.gle/aBcD1234", null, null,
                null,
                List.of(new QuestionItemPayload(null, "지원 동기는?", QuestionType.TEXT, true, null)),
                null, null, null);

        assertThatThrownBy(() -> request.toCommand(CLUB_ID, CURRENT_USER_ID))
                .isInstanceOf(RecruitmentException.InvalidApplicationModeException.class);
    }
}
