package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class PhoneVerificationException extends ApplicationException {

    protected PhoneVerificationException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class PhoneAlreadyRegisteredException extends PhoneVerificationException {
        private static final String MESSAGE = "이미 가입된 휴대폰 번호입니다. 로그인 후 이용해주세요.";

        public PhoneAlreadyRegisteredException() {
            super(MESSAGE, HttpStatus.CONFLICT, "PHONE_ALREADY_REGISTERED");
        }
    }

    public static class PhoneVerificationCooldownException extends PhoneVerificationException {
        private static final String MESSAGE = "잠시 후 다시 시도할 수 있습니다.";

        public PhoneVerificationCooldownException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "PHONE_VERIFICATION_COOLDOWN");
        }
    }

    /** 코드 문자열은 이메일 인증과 공유하지만 클래스는 분리한다 — PR2 에서 EmailVerificationException 이 삭제된다. */
    public static class VerificationRateLimitedException extends PhoneVerificationException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public VerificationRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED");
        }
    }

    public static class PhoneVerificationNotFoundException extends PhoneVerificationException {
        private static final String MESSAGE = "인증 요청을 찾을 수 없습니다. 인증을 다시 시작해주세요.";

        public PhoneVerificationNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND, "PHONE_VERIFICATION_NOT_FOUND");
        }
    }

    public static class SmsPollQuotaExceededException extends PhoneVerificationException {
        private static final String MESSAGE = "일시적으로 인증 확인이 제한되었습니다. 잠시 후 다시 시도해주세요.";

        public SmsPollQuotaExceededException() {
            super(MESSAGE, HttpStatus.SERVICE_UNAVAILABLE, "SMS_POLL_QUOTA_EXCEEDED");
        }
    }
}
