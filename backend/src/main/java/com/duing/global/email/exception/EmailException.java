package com.duing.global.email.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class EmailException extends ApplicationException {

    protected EmailException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class SendFailedException extends EmailException {
        private static final String MESSAGE = "인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.";
        private static final String CODE = "EMAIL_SEND_FAILED";

        public SendFailedException() {
            super(MESSAGE, HttpStatus.BAD_GATEWAY, CODE);
        }
    }
}
