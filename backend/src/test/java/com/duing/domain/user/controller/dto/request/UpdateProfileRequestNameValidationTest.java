package com.duing.domain.user.controller.dto.request;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.user.entity.Grade;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class UpdateProfileRequestNameValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    private UpdateProfileRequest withName(String name) {
        return new UpdateProfileRequest(name, Grade.FRESHMAN, null, null);
    }

    @ParameterizedTest
    @ValueSource(strings = {"홍길동", "김민수", "남궁민", "제갈성", "황보준", "이준", "가나다라마바사"})
    @DisplayName("한글 완성형 2~7자 이름으로 프로필을 수정할 수 있다")
    void hangulNamePasses(String name) {
        Set<ConstraintViolation<UpdateProfileRequest>> violations = validator.validate(withName(name));
        assertThat(violations).isEmpty();
    }

    @Test
    @DisplayName("이름의 앞뒤 공백은 제거된 값으로 검증·저장된다")
    void nameIsTrimmedBeforeValidation() {
        UpdateProfileRequest request = withName("  홍길동  ");
        assertThat(validator.validate(request)).isEmpty();
        assertThat(request.name()).isEqualTo("홍길동");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "여동근(테스트입니다)", "Terry", "홍길동123", "홍 길동", "홍길동!", "😀홍길동",
            "ㅁㄴㅇㄹ", "ㅏㅑㅓ", "ㄱ가ㄴ", "김", "가나다라마바사아", " "
    })
    @DisplayName("한글 완성형 2~7자가 아닌 이름으로는 프로필을 수정할 수 없다")
    void invalidNameFails(String name) {
        Set<ConstraintViolation<UpdateProfileRequest>> violations = validator.validate(withName(name));
        assertThat(violations).anyMatch(violation ->
                violation.getPropertyPath().toString().equals("name"));
    }
}
