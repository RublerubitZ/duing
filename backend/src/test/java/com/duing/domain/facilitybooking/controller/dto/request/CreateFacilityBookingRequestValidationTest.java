package com.duing.domain.facilitybooking.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class CreateFacilityBookingRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private CreateFacilityBookingRequest withContactPhone(String contactPhone) {
        return new CreateFacilityBookingRequest(
                1L, LocalDate.of(2026, 7, 20), LocalTime.of(18, 0), LocalTime.of(20, 0),
                "정기 합주", 15, contactPhone);
    }

    @ParameterizedTest
    @ValueSource(strings = {"010-1234-5678", "01012345678"})
    @DisplayName("하이픈 유무와 무관하게 휴대폰 번호 형식이면 대표 연락처 검증을 통과한다")
    void validContactPhonePasses(String contactPhone) {
        Set<ConstraintViolation<CreateFacilityBookingRequest>> violations =
                validator.validate(withContactPhone(contactPhone));

        assertThat(violations).noneMatch(violation ->
                violation.getPropertyPath().toString().equals("contactPhone"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"02-123-4567", "010-1234-567", "010-12-5678", "abcd", "010 1234 5678"})
    @DisplayName("휴대폰 번호 형식이 아닌 대표 연락처는 형식 오류 메시지로 거절된다")
    void malformedContactPhoneFails(String contactPhone) {
        Set<ConstraintViolation<CreateFacilityBookingRequest>> violations =
                validator.validate(withContactPhone(contactPhone));

        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("contactPhone")
                        && violation.getMessage().equals("휴대폰 번호 형식으로 입력해주세요."));
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "   "})
    @DisplayName("대표 연락처가 비어 있으면 필수 입력 메시지로 거절된다")
    void blankContactPhoneFails(String contactPhone) {
        Set<ConstraintViolation<CreateFacilityBookingRequest>> violations =
                validator.validate(withContactPhone(contactPhone));

        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("contactPhone")
                        && violation.getMessage().equals("대표 연락처를 입력해주세요."));
    }
}
