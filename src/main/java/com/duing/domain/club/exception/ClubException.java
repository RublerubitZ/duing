package com.duing.domain.club.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubException extends ApplicationException {

    protected ClubException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ClubNotFoundException extends ClubException {
        private static final String MESSAGE = "동아리를 찾을 수 없습니다.";

        public ClubNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class DuplicateClubNameException extends ClubException {
        private static final String MESSAGE = "이미 존재하는 동아리 이름입니다.";

        public DuplicateClubNameException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
