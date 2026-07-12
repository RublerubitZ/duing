package com.duing.domain.user.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class SignupRequestStudentIdValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private SignupRequest withStudentId(String studentId) {
        return new SignupRequest(
                studentId,
                "홍길동",
                "Abcd1234!",
                Grade.FRESHMAN,
                College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "verification-token",
                true,
                true
        );
    }

    @ParameterizedTest
    @ValueSource(strings = {"20240001", "00000000"})
    @DisplayName("학번은 정확히 8자리 숫자면 가입할 수 있다")
    void eightDigitStudentIdPasses(String studentId) {
        Set<ConstraintViolation<SignupRequest>> violations = validator.validate(withStudentId(studentId));
        assertThat(violations).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"2024001", "202400012", "2024000a", "0212345678"})
    @DisplayName("8자리가 아니거나 숫자 외 문자가 섞인 학번은 가입할 수 없다")
    void nonEightDigitStudentIdFails(String studentId) {
        Set<ConstraintViolation<SignupRequest>> violations = validator.validate(withStudentId(studentId));
        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("studentId"));
    }
}
