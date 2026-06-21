package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class EmailVerificationException extends ApplicationException {

    protected EmailVerificationException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class EmailVerificationNotFoundException extends EmailVerificationException {
        private static final String MESSAGE = "인증 요청 이력이 없습니다. 인증코드를 먼저 발송해주세요.";

        public EmailVerificationNotFoundException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "EMAIL_VERIFICATION_NOT_FOUND");
        }
    }

    public static class EmailVerificationExpiredException extends EmailVerificationException {
        private static final String MESSAGE = "인증코드가 만료되었습니다. 다시 발송해주세요.";

        public EmailVerificationExpiredException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "EMAIL_VERIFICATION_EXPIRED");
        }
    }

    public static class InvalidVerificationCodeException extends EmailVerificationException {
        private static final String MESSAGE = "인증코드가 올바르지 않습니다.";

        public InvalidVerificationCodeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "INVALID_VERIFICATION_CODE");
        }
    }

    public static class VerificationCooldownException extends EmailVerificationException {
        private static final String MESSAGE = "잠시 후 다시 발송할 수 있습니다.";

        public VerificationCooldownException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_COOLDOWN");
        }
    }

    public static class VerificationAttemptExceededException extends EmailVerificationException {
        private static final String MESSAGE = "시도 횟수를 초과했습니다. 인증코드를 다시 발송해주세요.";

        public VerificationAttemptExceededException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_ATTEMPT_EXCEEDED");
        }
    }

    public static class VerificationRateLimitedException extends EmailVerificationException {
        private static final String MESSAGE = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public VerificationRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "VERIFICATION_RATE_LIMITED");
        }
    }

    public static class EmailNotVerifiedException extends EmailVerificationException {
        private static final String MESSAGE = "이메일 인증이 필요합니다.";

        public EmailNotVerifiedException() {
            super(MESSAGE, HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        }
    }

    public static class EmailSendQuotaExceededException extends EmailVerificationException {
        private static final String MESSAGE = "일시적으로 발송이 제한되었습니다. 잠시 후 다시 시도해주세요.";

        public EmailSendQuotaExceededException() {
            super(MESSAGE, HttpStatus.SERVICE_UNAVAILABLE, "EMAIL_SEND_QUOTA_EXCEEDED");
        }
    }
}
