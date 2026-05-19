package com.duing.domain.user.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SignupRequestEmailValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private SignupRequest withEmail(String email) {
        return new SignupRequest(
                "20240001",
                "홍길동",
                email,
                "Abcd1234!",
                com.duing.domain.user.entity.Grade.FRESHMAN,
                com.duing.domain.user.entity.College.IT_ENGINEERING,
                "컴퓨터정보공학부",
                "010-1234-5678",
                true,
                true
        );
    }

    @Test
    @DisplayName("대구대학교 도메인 이메일은 회원가입 검증을 통과한다")
    void daeguDomainEmailPassesValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@daegu.ac.kr"));
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("대구대 서브도메인 이메일도 통과한다")
    void daeguSubDomainEmailPassesValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@stu.daegu.ac.kr"));
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("외부 도메인 이메일은 회원가입 검증에서 거부된다")
    void externalDomainEmailFailsValidation() {
        Set<ConstraintViolation<SignupRequest>> violations =
                validator.validate(withEmail("hong@gmail.com"));
        assertThat(violations).extracting(ConstraintViolation::getMessage)
                .contains("대구대학교 이메일(@daegu.ac.kr)만 사용할 수 있습니다.");
    }
}
