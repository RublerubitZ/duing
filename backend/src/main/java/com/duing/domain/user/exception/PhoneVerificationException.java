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

    /** 번호당 발급 총량(시간당 5회) 초과 — 쿨다운(60초)과 구분해 대기 시간을 안내한다. */
    public static class PhoneIssueLimitExceededException extends PhoneVerificationException {
        private static final String MESSAGE = "이 번호로 인증 요청이 너무 많았습니다. 최대 1시간 후 다시 시도할 수 있습니다.";

        public PhoneIssueLimitExceededException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS, "PHONE_ISSUE_LIMIT_EXCEEDED");
        }
    }

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

    /** 미존재·미인증·만료(완료 창 초과 포함)·용도 불일치 세션으로 완료(signup 등)를 시도 — 사유 미특정 단일 403 (spec §7.8). */
    public static class PhoneNotVerifiedException extends PhoneVerificationException {
        private static final String MESSAGE = "휴대폰 인증이 완료되지 않았습니다. 인증 후 다시 시도해주세요.";

        public PhoneNotVerifiedException() {
            super(MESSAGE, HttpStatus.FORBIDDEN, "PHONE_NOT_VERIFIED");
        }
    }
}
