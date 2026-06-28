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
        public InvalidApplicationModeException(String message) {
            super(message, HttpStatus.BAD_REQUEST);
        }
    }

    public static class AlwaysOpenConversionNotAllowedException extends RecruitmentException {
        private static final String MESSAGE = "상시모집과 기간모집은 서로 전환할 수 없습니다. 새 모집을 생성하세요.";

        public AlwaysOpenConversionNotAllowedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidInterviewPeriodException extends RecruitmentException {
        private static final String MESSAGE = "면접 종료일은 시작일보다 빠를 수 없습니다.";

        public InvalidInterviewPeriodException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class DuplicateActiveRecruitmentException extends RecruitmentException {
        private static final String MESSAGE = "이미 진행 중인 모집이 있습니다. 기존 모집을 마감하거나 교체 endpoint 를 사용하세요.";

        public DuplicateActiveRecruitmentException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class ApplicationsExistException extends RecruitmentException {
        private static final String MESSAGE = "이미 지원자가 있는 모집 공고는 삭제할 수 없습니다. 마감을 사용하세요.";

        public ApplicationsExistException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class OpenRecruitmentNotDeletableException extends RecruitmentException {
        private static final String MESSAGE = "진행 중인 모집 공고는 마감한 뒤에 삭제할 수 있습니다.";

        public OpenRecruitmentNotDeletableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
