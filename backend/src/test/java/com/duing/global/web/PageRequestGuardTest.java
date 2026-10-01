package com.duing.global.web;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.global.exception.InvalidPageRequestException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

class PageRequestGuardTest {

    @Test
    @DisplayName("오프셋이 int 최대값과 같으면 통과하고, 1 이라도 넘으면 예외를 던진다")
    void rejectsOnlyOffsetBeyondIntMax() {
        // int 최대값(2^31 - 1)은 소수라, 오프셋이 정확히 그 값인 페이지는 size 1 짜리뿐이다.
        assertThatCode(() -> PageRequestGuard.assertOffsetWithinInt(PageRequest.of(Integer.MAX_VALUE, 1)))
                .doesNotThrowAnyException();
        // page 2^30 × size 2 = 2^31 = int 최대값 + 1
        assertThatThrownBy(() -> PageRequestGuard.assertOffsetWithinInt(PageRequest.of(1 << 30, 2)))
                .isInstanceOf(InvalidPageRequestException.class);
    }

    @Test
    @DisplayName("페이지를 나누지 않는 요청(unpaged)은 오프셋이 없으므로 통과한다")
    void unpagedPasses() {
        assertThatCode(() -> PageRequestGuard.assertOffsetWithinInt(Pageable.unpaged()))
                .doesNotThrowAnyException();
    }
}
