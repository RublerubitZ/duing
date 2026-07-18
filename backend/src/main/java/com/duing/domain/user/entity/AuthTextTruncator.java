package com.duing.domain.user.entity;

/** 인증 엔티티 공용 텍스트 절단 — DB 컬럼 길이 초과 입력을 잘라 인증 트랜잭션의 value-too-long 500 을 막는다. */
final class AuthTextTruncator {

    private AuthTextTruncator() {
    }

    /** maxLength 로 절단하되 절단점이 high surrogate 면 한 글자 물러나 서로게이트 쌍을 쪼개지 않는다. */
    static String truncate(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        int end = maxLength;
        if (Character.isHighSurrogate(value.charAt(end - 1))) {
            end--;
        }
        return value.substring(0, end);
    }
}
