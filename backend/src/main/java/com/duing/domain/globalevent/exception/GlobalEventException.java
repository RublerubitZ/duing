package com.duing.domain.globalevent.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class GlobalEventException extends ApplicationException {

    protected GlobalEventException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class GlobalEventNotFoundException extends GlobalEventException {
        public GlobalEventNotFoundException() {
            super("글로벌 이벤트를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidPeriodException extends GlobalEventException {
        public InvalidPeriodException() {
            super("종료 시각은 시작 시각 이후여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidTitleException extends GlobalEventException {
        public InvalidTitleException() {
            super("제목은 공백일 수 없습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidWindowException extends GlobalEventException {
        public InvalidWindowException() {
            super("조회 기간은 400일 이내여야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
