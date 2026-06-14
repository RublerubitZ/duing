package com.duing.domain.user.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class UserException extends ApplicationException {

    protected UserException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class UserNotFoundException extends UserException {
        private static final String MESSAGE = "사용자를 찾을 수 없습니다.";

        public UserNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    // 이메일/학번/전화번호 중 무엇이 중복인지 응답으로 드러내지 않는 단일 예외 — 회원가입 응답으로
    // 특정 값의 가입 여부를 알아내는 계정 열거(account enumeration)를 막는다.
    public static class DuplicateAccountException extends UserException {
        private static final String MESSAGE = "이미 가입된 정보가 있습니다. 입력 내용을 다시 확인해주세요.";

        public DuplicateAccountException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class InvalidCredentialsException extends UserException {
        private static final String MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

        public InvalidCredentialsException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED);
        }
    }

    public static class InvalidSearchQueryException extends UserException {
        private static final String MESSAGE = "검색어를 입력해주세요.";

        public InvalidSearchQueryException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class AccountLockedException extends UserException {
        private static final String MESSAGE = "로그인 시도가 너무 많아 계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.";

        public AccountLockedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    public static class TooManyLoginAttemptsException extends UserException {
        private static final String MESSAGE = "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";

        public TooManyLoginAttemptsException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
        }
    }
}
