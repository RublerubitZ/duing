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
}
