package com.duing.domain.draft.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class DraftException extends ApplicationException {

    protected DraftException(String message, HttpStatus status) {
        super(message, status);
    }

    public static final class RecruitmentClosedException extends DraftException {
        private static final String MESSAGE = "마감된 모집에는 임시저장할 수 없습니다.";

        public RecruitmentClosedException() {
            super(MESSAGE, HttpStatus.GONE);
        }
    }
}