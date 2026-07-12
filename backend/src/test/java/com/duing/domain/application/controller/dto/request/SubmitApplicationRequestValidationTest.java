package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.application.controller.dto.request.SubmitApplicationRequest.AnswerItemPayload;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("답변 항목이 2000자를 초과하면 Bean Validation 에서 거부된다")
    void answerExceedingMaxLengthIsRejected() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("가".repeat(2001)), null);
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("2000자"));
    }

    @Test
    @DisplayName("답변이 50개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyAnswersIsRejected() {
        List<String> answers = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> "답변" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers, null);
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("50개 이하의 정상 길이 답변(빈 문자열 포함)은 통과한다")
    void validAnswersIncludingBlankPass() {
        List<String> answers = List.of("정상 답변", "", "가".repeat(2000));
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers, null);
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    @DisplayName("답변 50개(경계값)는 통과한다 — 질문 개수 상한(50)과 일치해 정상 폼 제출을 막지 않는다")
    void exactlyMaxAnswersPass() {
        List<String> answers = IntStream.rangeClosed(1, 50)
                .mapToObj(index -> "답변" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers, null);
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    @DisplayName("구조화 답변이 50개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyAnswerItemsIsRejected() {
        List<AnswerItemPayload> answerItems = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> new AnswerItemPayload("question-" + index, List.of("답변" + index)))
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(null, answerItems);
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("구조화 답변의 값 하나가 2000자를 초과하면 Bean Validation 에서 거부된다")
    void answerItemValueExceedingMaxLengthIsRejected() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, List.of(new AnswerItemPayload("question-1", List.of("가".repeat(2001)))));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("2000자"));
    }

    @Test
    @DisplayName("구조화 답변의 선택 항목이 20개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyAnswerItemValuesIsRejected() {
        List<String> values = IntStream.rangeClosed(1, 21)
                .mapToObj(index -> "choice-" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, List.of(new AnswerItemPayload("question-1", values)));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("20개 이하"));
    }

    @Test
    @DisplayName("구조화 답변의 questionId 가 공백이면 Bean Validation 에서 거부된다")
    void blankQuestionIdIsRejected() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, List.of(new AnswerItemPayload("   ", List.of("답변"))));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("questionId 는 필수"));
    }

    @Test
    @DisplayName("구조화 답변 항목 자체가 null 이면 Bean Validation 에서 거부된다")
    void nullAnswerItemElementIsRejected() {
        // @Size 컨테이너 제약도 @Valid 캐스케이드도 null 원소를 통과시키므로, 원소 @NotNull 이 없으면
        // answerItems:[null] 이 toCommand 까지 흘러가 NPE(500) 가 된다.
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, Arrays.asList((AnswerItemPayload) null));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("답변 항목은 비어 있을 수 없습니다"));
    }

    @Test
    @DisplayName("구조화 답변의 값 원소가 null 이면 Bean Validation 에서 거부된다")
    void nullAnswerItemValueElementIsRejected() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, List.of(new AnswerItemPayload("question-1", Arrays.asList("답변", null))));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("null 일 수 없습니다"));
    }

    @Test
    @DisplayName("구조화 답변 항목이 null 인 요청은 Bean Validation 이 먼저 막아 toCommand 가 호출되지 않는다")
    void nullAnswerItemElementIsBlockedBeforeToCommand() {
        // Bean Validation 이 뚫리면 toCommand 가 null 항목에서 NPE 를 던져 500 이 된다 —
        // 이 테스트는 "검증이 실제로 그 NPE 를 막는 위치에 있는지" 를 못 박는다.
        SubmitApplicationRequest request = new SubmitApplicationRequest(
                null, Arrays.asList((AnswerItemPayload) null));

        assertThat(validator.validate(request)).isNotEmpty();
        assertThatThrownBy(() -> request.toCommand(1L, 100L)).isInstanceOf(NullPointerException.class);
    }

    @Test
    @DisplayName("선택 항목 20개(경계값)와 값이 없는 구조화 답변은 통과한다")
    void validAnswerItemsPass() {
        List<String> maxValues = IntStream.rangeClosed(1, 20)
                .mapToObj(index -> "choice-" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(null, List.of(
                new AnswerItemPayload("question-1", maxValues),
                new AnswerItemPayload("question-2", List.of()),
                new AnswerItemPayload("question-3", null)));
        assertThat(validator.validate(request)).isEmpty();
    }
}
