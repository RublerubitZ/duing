package com.duing.domain.application.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ApplicationDomainException extends ApplicationException {

    protected ApplicationDomainException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class ApplicationNotFoundException extends ApplicationDomainException {
        private static final String MESSAGE = "지원 내역을 찾을 수 없습니다.";

        public ApplicationNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class DuplicateApplicationException extends ApplicationDomainException {
        private static final String MESSAGE = "이미 지원한 모집 공고입니다.";

        public DuplicateApplicationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class RecruitmentClosedException extends ApplicationDomainException {
        private static final String MESSAGE = "마감된 모집 공고에는 지원할 수 없습니다.";

        public RecruitmentClosedException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidAnswersException extends ApplicationDomainException {
        private static final String MESSAGE = "답변 개수가 질문 개수와 일치하지 않습니다.";

        public InvalidAnswersException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidStatusTransitionException extends ApplicationDomainException {
        private static final String MESSAGE = "허용되지 않는 상태 전이입니다.";

        public InvalidStatusTransitionException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class ExternalFormSubmitException extends ApplicationDomainException {
        private static final String MESSAGE = "외부 폼 모집은 du-ing 에서 직접 지원할 수 없습니다.";

        public ExternalFormSubmitException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class OfficerMembershipRequiredException extends ApplicationDomainException {
        private static final String MESSAGE = "운영진 모집은 해당 동아리의 기존 부원만 지원할 수 있습니다.";

        public OfficerMembershipRequiredException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class InvalidInterviewScheduleException extends ApplicationDomainException {
        private static final String MESSAGE = "면접 일정 정보가 올바르지 않습니다.";

        public InvalidInterviewScheduleException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class ForbiddenApplicationAccessException extends ApplicationDomainException {
        private static final String MESSAGE = "본인의 지원 내역만 조회할 수 있습니다.";

        public ForbiddenApplicationAccessException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class InvalidInterviewStateException extends ApplicationDomainException {
        private static final String MESSAGE = "면접 일정은 INTERVIEW_PENDING 상태에서만 입력할 수 있습니다.";

        public InvalidInterviewStateException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class ConcurrentStatusUpdateException extends ApplicationDomainException {
        private static final String MESSAGE = "다른 운영진이 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentStatusUpdateException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
