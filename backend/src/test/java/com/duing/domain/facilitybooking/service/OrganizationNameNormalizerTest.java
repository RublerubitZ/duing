package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class OrganizationNameNormalizerTest {

    private final OrganizationNameNormalizer normalizer = new OrganizationNameNormalizer();

    @Test
    @DisplayName("공백·끝 괄호 그룹을 제거하고 소문자로 통일한다")
    void normalizeStripsWhitespaceTrailingParenthesesAndCase() {
        assertThat(normalizer.normalize("비호 상무회")).isEqualTo("비호상무회");
        assertThat(normalizer.normalize("밴드부(공연준비)")).isEqualTo("밴드부");
        assertThat(normalizer.normalize("  BIHO Cheer ")).isEqualTo("bihocheer");
        assertThat(normalizer.normalize(null)).isEmpty();
    }

    @Test
    @DisplayName("중간 괄호는 보존하고 끝 괄호만 제거한다 — 커뮤니티룸(1) 같은 이름 보호")
    void keepsInnerParentheses() {
        assertThat(normalizer.normalize("고정관념(정기연습)")).isEqualTo("고정관념");
        assertThat(normalizer.normalize("동아리(A)연합")).isEqualTo("동아리(a)연합");
    }
}
