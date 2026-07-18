package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class AuthSessionException extends ApplicationException {

    protected AuthSessionException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /**
     * Refresh 실패는 사유 불문 단일 401 — 재사용 탐지 여부를 외부에 구분해 주지 않는다 (spec §8).
     * 상세 사유는 auth_event·Sentry 로만 남긴다.
     */
    public static class SessionExpiredException extends AuthSessionException {
        private static final String MESSAGE = "로그인이 만료되었습니다. 다시 로그인해주세요.";

        public SessionExpiredException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED, "AUTH_SESSION_EXPIRED");
        }
    }
}
