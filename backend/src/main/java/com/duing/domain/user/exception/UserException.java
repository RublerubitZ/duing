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

    public static class DuplicateEmailException extends UserException {
        private static final String MESSAGE = "이미 사용 중인 이메일입니다.";

        public DuplicateEmailException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class DuplicateStudentIdException extends UserException {
        private static final String MESSAGE = "이미 등록된 학번입니다.";

        public DuplicateStudentIdException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class InvalidCredentialsException extends UserException {
        private static final String MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";

        public InvalidCredentialsException() {
            super(MESSAGE, HttpStatus.UNAUTHORIZED);
        }
    }

    public static class PhoneAlreadyExistsException extends UserException {
        private static final String MESSAGE = "이미 등록된 전화번호입니다.";

        public PhoneAlreadyExistsException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class LeaderCannotWithdrawException extends UserException {
        private static final String MESSAGE = "동아리 회장은 회장직을 인계한 뒤 탈퇴할 수 있습니다.";

        public LeaderCannotWithdrawException() {
            super(MESSAGE, HttpStatus.CONFLICT);
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
