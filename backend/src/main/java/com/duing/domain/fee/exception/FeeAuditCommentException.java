package com.duing.domain.fee.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FeeAuditCommentException extends ApplicationException {

    protected FeeAuditCommentException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    /** 없는 의견·메모거나 경로의 동아리 소속이 아니다 — 존재를 알리지 않도록 둘 다 같은 404 다(스펙 §7.11 IDOR 가드). */
    public static class FeeAuditCommentNotFoundException extends FeeAuditCommentException {
        private static final String MESSAGE = "감사 의견 또는 메모를 찾을 수 없습니다.";

        public FeeAuditCommentNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND, "FEE_AUDIT_COMMENT_NOT_FOUND");
        }
    }

    public static class StatusNotAllowedException extends FeeAuditCommentException {
        private static final String MESSAGE = "운영 메모에는 처리 상태를 지정할 수 없습니다.";

        public StatusNotAllowedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST, "FEE_AUDIT_COMMENT_STATUS_NOT_ALLOWED");
        }
    }
}
