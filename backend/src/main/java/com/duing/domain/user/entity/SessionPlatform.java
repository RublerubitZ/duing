package com.duing.domain.user.entity;

public enum SessionPlatform {
    WEB, IOS, ANDROID, UNKNOWN;

    /** 클라이언트 자유 입력을 안전하게 매핑한다 — 모르는 값은 UNKNOWN. */
    public static SessionPlatform from(String raw) {
        if (raw == null) return UNKNOWN;
        try {
            return SessionPlatform.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ignored) {
            return UNKNOWN;
        }
    }
}
