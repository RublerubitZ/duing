package com.duing.domain.user.support;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PhoneMaskerTest {

    @Test
    @DisplayName("표준 형식 전화번호는 가운데 그룹이 마스킹된다")
    void masksMiddleGroupForStandardFormat() {
        assertThat(PhoneMasker.mask("010-1234-5678")).isEqualTo("010-****-5678");
    }

    @Test
    @DisplayName("null 은 null 로 둔다")
    void keepsNullAsNull() {
        assertThat(PhoneMasker.mask(null)).isNull();
    }

    @Test
    @DisplayName("하이픈이 없는 형식은 마지막 4자리만 남기고 가린다")
    void masksAllButLastFourForNonStandardFormat() {
        assertThat(PhoneMasker.mask("01012345678")).isEqualTo("****-5678");
    }

    @Test
    @DisplayName("자릿수가 4 이하이거나 빈 문자열이면 전체를 마스킹한다")
    void fullyMasksShortValue() {
        assertThat(PhoneMasker.mask("12")).isEqualTo("****");
        assertThat(PhoneMasker.mask("1234")).isEqualTo("****");
        assertThat(PhoneMasker.mask("")).isEqualTo("****");
    }
}
