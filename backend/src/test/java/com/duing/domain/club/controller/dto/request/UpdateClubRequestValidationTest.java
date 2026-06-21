package com.duing.domain.club.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 연락처(contactEmail) 검증 정책 변경 검증.
 * 이메일 전용에서 자유 입력으로 바뀌어 형식(@Email) 검증은 없고 길이(@Size(max=200)) 제한만 남는다.
 */
class UpdateClubRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    @DisplayName("이메일 형식이 아닌 연락처(전화번호)도 검증을 통과한다")
    void nonEmailContactPassesValidation() {
        Set<ConstraintViolation<UpdateClubRequest>> violations =
                validator.validateProperty(requestWithContact("010-0000-0000"), "contactEmail");

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("연락처가 200자를 초과하면 검증에 실패한다")
    void tooLongContactFailsValidation() {
        Set<ConstraintViolation<UpdateClubRequest>> violations =
                validator.validateProperty(requestWithContact("a".repeat(201)), "contactEmail");

        assertThat(violations).hasSize(1);
        assertThat(violations.iterator().next().getMessage()).contains("연락처");
    }

    private static UpdateClubRequest requestWithContact(String contactEmail) {
        return new UpdateClubRequest(
                null, null, null, null, null, null, null, null, null,  // name~faqs
                null, null, null,                                       // foundedYear, cohortNumber, location
                contactEmail,                                           // contactEmail
                null, null, null,                                       // activityFrequency, activeDays, membershipFee
                null, null, null,                                       // tagline, highlights, majorProjects
                null, null,                                             // college, clearCollege
                null, null                                              // clearLogoImage, clearCoverImage
        );
    }
}
