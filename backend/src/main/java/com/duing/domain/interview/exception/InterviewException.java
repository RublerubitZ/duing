package com.duing.domain.interview.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class InterviewException extends ApplicationException {

    protected InterviewException(String message, HttpStatus status) {
        super(message, status);
    }

    // ── 409 슬롯 수정 ──────────────────────────────────────────────────────────

    public static final class CapacityBelowAssigned extends InterviewException {
        private static final String MESSAGE = "정원이 이미 배정된 인원수보다 적을 수 없습니다.";
        public CapacityBelowAssigned() { super(MESSAGE, HttpStatus.CONFLICT); }
    }

    // ── 400 Bad Request ───────────────────────────────────────────────────────

    public static final class InterviewNotUsed extends InterviewException {
        private static final String MESSAGE = "면접을 사용하지 않는 모집입니다.";
        public InterviewNotUsed() { super(MESSAGE, HttpStatus.BAD_REQUEST); }
    }
}
