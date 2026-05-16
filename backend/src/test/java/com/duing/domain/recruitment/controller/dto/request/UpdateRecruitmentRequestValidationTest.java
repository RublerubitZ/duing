package com.duing.domain.recruitment.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class UpdateRecruitmentRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("capacity 를 0 으로 수정하려 하면 Bean Validation 에서 거부된다")
    void updateWithZeroCapacityIsRejectedByBeanValidation() {
        UpdateRecruitmentRequest request = new UpdateRecruitmentRequest(
                null, null, null, null, 0, null, null
        );
        Set<ConstraintViolation<UpdateRecruitmentRequest>> violations = validator.validate(request);
        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("capacity"));
    }
}