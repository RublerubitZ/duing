package com.duing.domain.application.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmitApplicationRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("답변 항목이 2000자를 초과하면 Bean Validation 에서 거부된다")
    void answerExceedingMaxLengthIsRejected() {
        SubmitApplicationRequest request = new SubmitApplicationRequest(List.of("가".repeat(2001)));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("2000자"));
    }

    @Test
    @DisplayName("답변이 50개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyAnswersIsRejected() {
        List<String> answers = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> "답변" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers);
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("50개 이하의 정상 길이 답변(빈 문자열 포함)은 통과한다")
    void validAnswersIncludingBlankPass() {
        List<String> answers = List.of("정상 답변", "", "가".repeat(2000));
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers);
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    @DisplayName("답변 50개(경계값)는 통과한다 — 질문 개수 상한(50)과 일치해 정상 폼 제출을 막지 않는다")
    void exactlyMaxAnswersPass() {
        List<String> answers = IntStream.rangeClosed(1, 50)
                .mapToObj(index -> "답변" + index)
                .toList();
        SubmitApplicationRequest request = new SubmitApplicationRequest(answers);
        assertThat(validator.validate(request)).isEmpty();
    }
}
