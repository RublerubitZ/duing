package com.duing.global.constant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TagRulesTest {

    @Test
    @DisplayName("normalize 는 null·제어문자·앞뒤 공백을 지우고 빈 값과 중복을 버린다(순서 유지)")
    void normalizesTags() {
        String[] normalized = TagRules.normalize(Arrays.asList(
                null, " 축구 ", "축구", "개\u001F발", "   ", "풋\t살", "", "모\u0085집"));

        assertThat(normalized).containsExactly("축구", "개발", "풋살", "모집");
    }
}
