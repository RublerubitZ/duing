package com.duing.domain.clubevent.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ClubEventException extends ApplicationException {

    protected ClubEventException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ClubEventNotFoundException extends ClubEventException {
        public ClubEventNotFoundException() {
            super("일정을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidPeriodException extends ClubEventException {
        public InvalidPeriodException() {
            super("종료 시각은 시작 시각 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidTitleException extends ClubEventException {
        public InvalidTitleException() {
            super("제목은 공백일 수 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidWindowException extends ClubEventException {
        public InvalidWindowException() {
            super("조회 기간은 400일 이내여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class CrossClubAccessException extends ClubEventException {
        public CrossClubAccessException() {
            super("다른 동아리의 일정에 접근할 수 없습니다.", HttpStatus.FORBIDDEN);
        }
    }
}
