package com.duing.domain.notice.broadcast.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class NoticeBroadcastException extends ApplicationException {

    protected NoticeBroadcastException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NoticeBroadcastNotFoundException extends NoticeBroadcastException {
        private static final String MESSAGE = "공지 broadcast 를 찾을 수 없습니다.";
        public NoticeBroadcastNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }
}
