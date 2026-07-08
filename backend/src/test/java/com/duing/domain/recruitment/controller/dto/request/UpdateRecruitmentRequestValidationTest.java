package com.duing.domain.recruitment.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import java.util.Set;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UpdateRecruitmentRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("capacity 를 0 으로 수정하려 하면 Bean Validation 에서 거부된다")
    void updateWithZeroCapacityIsRejectedByBeanValidation() {
        UpdateRecruitmentRequest request = new UpdateRecruitmentRequest(
                null, null, null, null, 0, null, null,
                null,
                null,
                null
        );
        Set<ConstraintViolation<UpdateRecruitmentRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("capacity"));
    }

    @Test
    @DisplayName("질문 항목이 500자를 초과하면 Bean Validation 에서 거부된다")
    void updateWithTooLongQuestionIsRejected() {
        UpdateRecruitmentRequest request = new UpdateRecruitmentRequest(
                null, null, null, null, null, null,
                List.of("가".repeat(501)),
                null, null, null
        );
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("500자"));
    }

    @Test
    @DisplayName("질문이 50개를 초과하면 Bean Validation 에서 거부된다")
    void updateWithTooManyQuestionsIsRejected() {
        List<String> questions = IntStream.rangeClosed(1, 51)
                .mapToObj(index -> "질문" + index)
                .toList();
        UpdateRecruitmentRequest request = new UpdateRecruitmentRequest(
                null, null, null, null, null, null,
                questions,
                null, null, null
        );
        assertThat(validator.validate(request)).anyMatch(violation ->
                violation.getMessage().contains("최대 50개"));
    }
}