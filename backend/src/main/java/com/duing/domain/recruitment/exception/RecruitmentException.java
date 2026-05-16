package com.duing.domain.recruitment.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class RecruitmentException extends ApplicationException {

    protected RecruitmentException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class RecruitmentNotFoundException extends RecruitmentException {
        private static final String MESSAGE = "모집 공고를 찾을 수 없습니다.";

        public RecruitmentNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class InvalidRecruitmentPeriodException extends RecruitmentException {
        private static final String MESSAGE = "모집 기간이 올바르지 않습니다.";

        public InvalidRecruitmentPeriodException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class RecruitmentAlreadyClosedException extends RecruitmentException {
        private static final String MESSAGE = "이미 마감된 모집 공고입니다.";

        public RecruitmentAlreadyClosedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class InvalidApplicationModeException extends RecruitmentException {
        private static final String MESSAGE = "자체 지원 폼 모집 공고에서만 질문을 수정할 수 있습니다.";

        public InvalidApplicationModeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
