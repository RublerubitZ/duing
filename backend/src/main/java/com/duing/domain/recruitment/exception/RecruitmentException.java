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
}
