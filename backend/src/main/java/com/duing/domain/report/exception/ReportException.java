package com.duing.domain.report.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ReportException extends ApplicationException {

    protected ReportException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ReportNotFoundException extends ReportException {
        private static final String MESSAGE = "신고를 찾을 수 없습니다.";
        public ReportNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class ReportTargetNotFoundException extends ReportException {
        private static final String MESSAGE = "신고 대상이 존재하지 않습니다.";
        public ReportTargetNotFoundException() { super(MESSAGE, HttpStatus.NOT_FOUND); }
    }

    public static class SelfReportNotAllowedException extends ReportException {
        private static final String MESSAGE = "운영 중인 동아리/모집공고는 신고할 수 없습니다.";
        public SelfReportNotAllowedException() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }

    public static class DuplicatePendingReportException extends ReportException {
        private static final String MESSAGE = "이미 처리 대기 중인 신고가 있습니다.";
        public DuplicatePendingReportException() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    public static class InvalidReportTransitionException extends ReportException {
        public InvalidReportTransitionException(String reason) {
            super("신고 상태 전이가 올바르지 않습니다: " + reason, HttpStatus.BAD_REQUEST);
        }
    }
}
