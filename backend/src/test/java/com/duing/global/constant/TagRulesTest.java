package com.duing.global.constant;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class TagRulesTest {

    @Test
    @DisplayName("태그는 저장 전에 null·제어문자·앞뒤 공백이 지워지고 빈 값과 중복이 버려진다(처음 나온 순서 유지)")
    void normalizesTags() {
        String[] normalized = TagRules.normalize(Arrays.asList(
                null, " 축구 ", "축구", "개\u001F발", "   ", "풋\t살", "", "모\u0085집"));

        assertThat(normalized).containsExactly("축구", "개발", "풋살", "모집");
    }

    @Test
    @DisplayName("같아 보이는 태그는 하나로 합쳐진다 — 줄바꿈 없는 공백·보이지 않는 서식 문자·분해된 한글")
    void foldsLookAlikeTags() {
        String[] normalized = TagRules.normalize(Arrays.asList(
                "축구", "\u00A0축구\u202F", "\uFEFF축구", "축\u200B구", "\u1100\u1161\u11BC", "강"));

        assertThat(normalized).containsExactly("축구", "강");
    }

    @Test
    @DisplayName("이모지 조합에 쓰는 ZWJ 는 지우지 않는다")
    void keepsZeroWidthJoinerInEmoji() {
        assertThat(TagRules.normalize(Arrays.asList("코딩👨\u200D💻"))).containsExactly("코딩👨\u200D💻");
    }
}
