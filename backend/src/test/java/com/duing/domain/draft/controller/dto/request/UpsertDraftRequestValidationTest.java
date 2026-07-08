package com.duing.domain.draft.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.draft.controller.dto.request.UpsertDraftRequest.DraftAnswerPayload;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UpsertDraftRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("임시저장 답변 값이 2000자를 초과하면 캐스케이드 검증에서 거부된다")
    void draftValueExceedingMaxLengthIsRejected() {
        UpsertDraftRequest request = new UpsertDraftRequest(
                List.of(new DraftAnswerPayload("1", "가".repeat(2001), null)));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("2000자"));
    }

    @Test
    @DisplayName("임시저장 답변이 50개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyDraftAnswersIsRejected() {
        List<DraftAnswerPayload> answers = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> new DraftAnswerPayload(String.valueOf(index), "값" + index, null))
                .toList();
        UpsertDraftRequest request = new UpsertDraftRequest(answers);
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 50개"));
    }

    @Test
    @DisplayName("50개 이하의 정상 길이 임시저장 답변은 통과한다")
    void validDraftAnswersPass() {
        UpsertDraftRequest request = new UpsertDraftRequest(List.of(
                new DraftAnswerPayload("1", "정상 값", null),
                new DraftAnswerPayload("2", "가".repeat(2000), null)));
        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    @DisplayName("values 의 선택지 개수가 20개를 초과하면 Bean Validation 에서 거부된다")
    void tooManyValuesIsRejected() {
        List<String> values = IntStream.rangeClosed(1, 21).mapToObj(index -> "선택지" + index).toList();
        UpsertDraftRequest request = new UpsertDraftRequest(
                List.of(new DraftAnswerPayload("1", null, values)));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 20개"));
    }

    @Test
    @DisplayName("values 원소가 2000자를 초과하면 캐스케이드 검증에서 거부된다")
    void valuesElementExceedingMaxLengthIsRejected() {
        UpsertDraftRequest request = new UpsertDraftRequest(
                List.of(new DraftAnswerPayload("1", null, List.of("가".repeat(2001)))));
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("2000자"));
    }
}
