package com.duing.domain.recruitment.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.recruitment.controller.dto.request.QuestionItemPayload.ChoiceItemPayload;
import com.duing.domain.recruitment.entity.QuestionType;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * questionItems 의 필드 형식 검증(길이·개수·공백)은 요청 DTO Bean Validation 이 책임진다.
 * 유형별 의미 검증(선택지 2개 이상 등)은 {@code RecruitmentQuestion.validateDefinitions} 담당이라 여기서 다루지 않는다.
 */
class QuestionItemPayloadValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private static CreateRecruitmentRequest createRequestWith(List<QuestionItemPayload> questionItems) {
        return new CreateRecruitmentRequest(
                "제목",
                null,
                LocalDate.now(),
                null,
                1,
                null,
                null,
                null,
                null,
                null,
                questionItems,
                null,
                null,
                null
        );
    }

    private static UpdateRecruitmentRequest updateRequestWith(List<QuestionItemPayload> questionItems) {
        return new UpdateRecruitmentRequest(
                null, null, null, null, null, null,
                null,
                questionItems,
                null, null, null
        );
    }

    private static QuestionItemPayload textItem(String text) {
        return new QuestionItemPayload(null, text, QuestionType.TEXT, null, null);
    }

    private static QuestionItemPayload choiceItem(List<ChoiceItemPayload> choices) {
        return new QuestionItemPayload(null, "관심 분야는?", QuestionType.SINGLE_CHOICE, true, choices);
    }

    private static List<ChoiceItemPayload> choices(int count) {
        return IntStream.rangeClosed(1, count)
                .mapToObj(index -> new ChoiceItemPayload(null, "선택지" + index))
                .toList();
    }

    @Test
    @DisplayName("questionItems 의 질문 텍스트가 500자를 초과하면 Bean Validation 에서 거부된다")
    void questionItemTextOver500CharactersIsRejected() {
        assertThat(validator.validate(createRequestWith(List.of(textItem("가".repeat(501))))))
                .anyMatch(violation -> violation.getMessage().contains("500자"));
    }

    @Test
    @DisplayName("questionItems 의 질문 텍스트 500자(경계값)는 통과한다")
    void questionItemTextWithExactly500CharactersPasses() {
        assertThat(validator.validate(createRequestWith(List.of(textItem("가".repeat(500)))))).isEmpty();
    }

    @Test
    @DisplayName("questionItems 의 질문 텍스트가 공백이면 Bean Validation 에서 거부된다")
    void blankQuestionItemTextIsRejected() {
        assertThat(validator.validate(createRequestWith(List.of(textItem("   ")))))
                .anyMatch(violation -> violation.getMessage().contains("빈 문자열"));
    }

    @Test
    @DisplayName("questionItems 의 질문 유형을 생략하면 Bean Validation 에서 거부된다")
    void missingQuestionTypeIsRejected() {
        QuestionItemPayload noType = new QuestionItemPayload(null, "질문", null, null, null);

        assertThat(validator.validate(createRequestWith(List.of(noType))))
                .anyMatch(violation -> violation.getMessage().contains("질문 유형은 필수"));
    }

    @Test
    @DisplayName("선택지가 질문당 20개를 초과하면 Bean Validation 에서 거부된다")
    void moreThan20ChoicesIsRejected() {
        assertThat(validator.validate(createRequestWith(List.of(choiceItem(choices(21))))))
                .anyMatch(violation -> violation.getMessage().contains("최대 20개"));
    }

    @Test
    @DisplayName("선택지 20개(경계값)는 통과한다")
    void exactly20ChoicesPasses() {
        assertThat(validator.validate(createRequestWith(List.of(choiceItem(choices(20)))))).isEmpty();
    }

    @Test
    @DisplayName("선택지 라벨이 200자를 초과하면 Bean Validation 에서 거부된다")
    void choiceLabelOver200CharactersIsRejected() {
        List<ChoiceItemPayload> tooLongLabel = List.of(
                new ChoiceItemPayload(null, "백엔드"),
                new ChoiceItemPayload(null, "가".repeat(201)));

        assertThat(validator.validate(createRequestWith(List.of(choiceItem(tooLongLabel)))))
                .anyMatch(violation -> violation.getMessage().contains("200자"));
    }

    @Test
    @DisplayName("선택지 라벨 200자(경계값)는 통과한다")
    void choiceLabelWithExactly200CharactersPasses() {
        List<ChoiceItemPayload> boundaryLabel = List.of(
                new ChoiceItemPayload(null, "백엔드"),
                new ChoiceItemPayload(null, "가".repeat(200)));

        assertThat(validator.validate(createRequestWith(List.of(choiceItem(boundaryLabel))))).isEmpty();
    }

    @Test
    @DisplayName("선택지 라벨이 공백이면 Bean Validation 에서 거부된다")
    void blankChoiceLabelIsRejected() {
        List<ChoiceItemPayload> blankLabel = List.of(
                new ChoiceItemPayload(null, "백엔드"),
                new ChoiceItemPayload(null, "   "));

        assertThat(validator.validate(createRequestWith(List.of(choiceItem(blankLabel)))))
                .anyMatch(violation -> violation.getMessage().contains("빈 문자열"));
    }

    @Test
    @DisplayName("questionItems 가 50개를 초과하면 Bean Validation 에서 거부된다")
    void moreThan50QuestionItemsIsRejected() {
        List<QuestionItemPayload> tooManyItems = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> textItem("질문" + index))
                .toList();

        assertThat(validator.validate(createRequestWith(tooManyItems)))
                .anyMatch(violation -> violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("questionItems 50개(경계값)는 통과한다 — 답변 개수 상한과 일치")
    void exactly50QuestionItemsPasses() {
        List<QuestionItemPayload> boundaryItems = IntStream.rangeClosed(1, 50)
                .mapToObj(index -> textItem("질문" + index))
                .toList();

        assertThat(validator.validate(createRequestWith(boundaryItems))).isEmpty();
    }

    @Test
    @DisplayName("questionItems 의 원소가 null 이면 Bean Validation 에서 거부된다 — 역직렬화된 null 원소로 500 이 나지 않는다")
    void nullQuestionItemElementIsRejected() {
        assertThat(validator.validate(createRequestWith(Arrays.asList((QuestionItemPayload) null))))
                .isNotEmpty();
    }

    @Test
    @DisplayName("선택지 목록의 원소가 null 이면 Bean Validation 에서 거부된다 — 역직렬화된 null 원소로 500 이 나지 않는다")
    void nullChoiceElementIsRejected() {
        QuestionItemPayload withNullChoice = choiceItem(Arrays.asList(
                new ChoiceItemPayload(null, "백엔드"), null));

        assertThat(validator.validate(createRequestWith(List.of(withNullChoice)))).isNotEmpty();
    }

    @Test
    @DisplayName("수정 요청의 questionItems 도 생성 요청과 동일한 형식 제약을 적용받는다")
    void updateRequestAppliesSameQuestionItemConstraints() {
        assertThat(validator.validate(updateRequestWith(List.of(textItem("가".repeat(501))))))
                .anyMatch(violation -> violation.getMessage().contains("500자"));
        assertThat(validator.validate(updateRequestWith(List.of(choiceItem(choices(21))))))
                .anyMatch(violation -> violation.getMessage().contains("최대 20개"));

        List<QuestionItemPayload> tooManyItems = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> textItem("질문" + index))
                .toList();
        assertThat(validator.validate(updateRequestWith(tooManyItems)))
                .anyMatch(violation -> violation.getMessage().contains("최대 50개"));
    }
}
