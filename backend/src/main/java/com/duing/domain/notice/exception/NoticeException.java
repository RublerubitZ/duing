package com.duing.domain.notice.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class NoticeException extends ApplicationException {

    protected NoticeException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class NoticeNotFoundException extends NoticeException {
        private static final String MESSAGE = "공지를 찾을 수 없습니다.";
        public NoticeNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class NoticeAccessDeniedException extends NoticeException {
        private static final String MESSAGE = "공지에 접근할 권한이 없습니다.";
        public NoticeAccessDeniedException() { super(MESSAGE, HttpStatus.FORBIDDEN); }
    }

    public static class InvalidNoticeScopeException extends NoticeException {
        public InvalidNoticeScopeException(String reason) {
            super("공지 노출 범위 설정이 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidCoverImageUrlException extends NoticeException {
        private static final String MESSAGE = "허용되지 않는 대표 이미지 URL 입니다.";
        public InvalidCoverImageUrlException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
}
