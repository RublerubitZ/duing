package com.duing.domain.club.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.user.entity.College;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 소속 정보(단과대학·학과) 입력 규칙 검증.
 * 단과대학은 단과대 동아리의 정체성이라 생성 시점부터 필수이고, 학과는 선택값이다.
 */
class ClubAffiliationRequestValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setUp() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private CreateClubRequest createRequest(boolean centralClub, College college, String department) {
        return new CreateClubRequest(
                "동아리", ClubCategory.ACADEMIC, null, "설명", null, 1L, centralClub, college, department);
    }

    private boolean hasViolationOn(Set<? extends ConstraintViolation<?>> violations, String field) {
        return violations.stream().anyMatch(violation -> violation.getPropertyPath().toString().equals(field));
    }

    @Test
    @DisplayName("단과대 동아리 생성에 단과대학이 없으면 거부된다")
    void rejectsNonCentralClubWithoutCollege() {
        Set<ConstraintViolation<CreateClubRequest>> violations =
                validator.validate(createRequest(false, null, "회계학과"));

        assertThat(hasViolationOn(violations, "collegePresentForNonCentral")).isTrue();
    }

    @Test
    @DisplayName("단과대 동아리는 학과 없이도 생성할 수 있다")
    void acceptsNonCentralClubWithoutDepartment() {
        Set<ConstraintViolation<CreateClubRequest>> violations =
                validator.validate(createRequest(false, College.GLOBAL_BUSINESS, null));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("중앙동아리는 단과대학 없이 생성할 수 있다")
    void acceptsCentralClubWithoutCollege() {
        Set<ConstraintViolation<CreateClubRequest>> violations =
                validator.validate(createRequest(true, null, null));

        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("학과가 50자를 넘으면 거부된다")
    void rejectsTooLongDepartment() {
        Set<ConstraintViolation<CreateClubRequest>> violations =
                validator.validate(createRequest(false, College.GLOBAL_BUSINESS, "학".repeat(51)));

        assertThat(hasViolationOn(violations, "department")).isTrue();
    }

    @Test
    @DisplayName("운영진 수정 요청은 학과를 담고 단과대학은 잠금 필드라 커맨드에도 실리지 않는다")
    void leaderRequestCarriesDepartmentButNeverCollege() {
        UpdateClubRequest leaderRequest = new UpdateClubRequest(
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "회계학과");

        var command = leaderRequest.toCommand(1L, 2L);

        assertThat(command.department()).isEqualTo("회계학과");
        assertThat(command.college()).isNull();
        assertThat(command.clearCollege()).isNull();
        assertThat(command.division()).isNull();
    }
}
