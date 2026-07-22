package com.duing.domain.user.service;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.user.exception.UserException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ReservedNamePolicyTest {

    private final ReservedNamePolicy reservedNamePolicy = new ReservedNamePolicy();

    @ParameterizedTest
    @ValueSource(strings = {
            "테스트", "테스터", "관리자", "운영자", "최고관리자", "아무개", "샘플", "예시",
            "example", "test", "admin", "qwer", "asdf", "TEST", "Admin", "QWER"
    })
    @DisplayName("금칙어와 대소문자 구분 없이 정확히 일치하는 이름은 거부된다")
    void reservedNameIsRejected(String name) {
        assertThatThrownBy(() -> reservedNamePolicy.validate(name))
                .isInstanceOf(UserException.ReservedNameException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"홍길동", "김테스트", "테스트김", "관리자님"})
    @DisplayName("금칙어를 포함하기만 하고 정확히 일치하지 않는 이름은 거부되지 않는다")
    void nonReservedNameIsAllowed(String name) {
        assertThatCode(() -> reservedNamePolicy.validate(name)).doesNotThrowAnyException();
    }
}
