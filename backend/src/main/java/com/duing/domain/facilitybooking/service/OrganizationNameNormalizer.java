package com.duing.domain.facilitybooking.service;

import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Component;

/** 학교 표기 ↔ 동아리명 비교용 정규화(§5.3): trim → 끝 괄호 그룹 제거 → 전체 공백 제거 → 소문자. */
@Component
public class OrganizationNameNormalizer {

    private static final Pattern TRAILING_PARENTHETICAL = Pattern.compile("\\([^()]*\\)\\s*$");

    public String normalize(String rawName) {
        if (rawName == null) {
            return "";
        }
        String withoutTrailingGroup = TRAILING_PARENTHETICAL.matcher(rawName.trim()).replaceFirst("");
        return withoutTrailingGroup.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }
}
