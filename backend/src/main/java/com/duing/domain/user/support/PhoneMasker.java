package com.duing.domain.user.support;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 전화번호를 화면 표시용으로 마스킹한다.
 * 표준 형식(010-1234-5678)은 가운데 그룹을 가려 010-****-5678 로,
 * 예상과 다른 형식은 마지막 4자리만 남기고 가린다. null 은 null 로 둔다.
 * 개인정보 최소 노출 정책에 따라 여러 화면에서 재사용한다.
 */
public final class PhoneMasker {

    private static final Pattern STANDARD = Pattern.compile("^(\\d{2,3})-\\d{3,4}-(\\d{4})$");

    private PhoneMasker() {
    }

    public static String mask(String phone) {
        if (phone == null) {
            return null;
        }
        Matcher matcher = STANDARD.matcher(phone);
        if (matcher.matches()) {
            return matcher.group(1) + "-****-" + matcher.group(2);
        }
        String digits = phone.replaceAll("\\D", "");
        if (digits.length() <= 4) {
            // 4자리 이하만 있으면 마지막 4자리를 노출해도 가린 게 없으므로 전체를 마스킹한다.
            return "****";
        }
        return "****-" + digits.substring(digits.length() - 4);
    }
}
