package com.duing.domain.application.exception;

import com.duing.global.constant.ErrorCodes;
import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class ApplicationDomainException extends ApplicationException {

    protected ApplicationDomainException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 프론트가 분기할 machine-readable code 를 함께 싣는 경우에 사용한다. */
    protected ApplicationDomainException(String message, HttpStatus status, String code) {
        super(message, status, code);
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

    /**
     * 마감된 모집에 대한 지원 제출·사전 확인 거절. 철회(CannotWithdrawClosedRecruitmentException)·
     * 면접 가능 시간 제출·모집 관리 쓰기와 같은 409 + RECRUITMENT_CLOSED 계약을 공유한다 —
     * FE 는 code 로 마감 상태 전환을 분기한다. (감사 BE-EC-02 2단계)
     */
    public static class RecruitmentClosedException extends ApplicationDomainException {
        private static final String MESSAGE = "마감된 모집 공고에는 지원할 수 없습니다.";

        public RecruitmentClosedException() {
            super(MESSAGE, HttpStatus.CONFLICT, ErrorCodes.RECRUITMENT_CLOSED);
        }
    }

    public static class InvalidAnswersException extends ApplicationDomainException {
        private static final String MESSAGE = "답변 개수가 질문 개수와 일치하지 않습니다.";

        public InvalidAnswersException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** 신·구 답변 페이로드 규칙 위반 — 함께 보냄 / 둘 다 없음에 따라 메시지가 달라진다 (스펙 §2.5). */
    public static class InvalidAnswerPayloadException extends ApplicationDomainException {

        public InvalidAnswerPayloadException(String message) {
            super(message, HttpStatus.BAD_REQUEST);
        }
    }

    public static class RequiredAnswerMissingException extends ApplicationDomainException {
        private static final String MESSAGE = "필수 질문에 답변을 입력해주세요.";

        public RequiredAnswerMissingException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidChoiceSelectionException extends ApplicationDomainException {
        private static final String MESSAGE = "유효하지 않은 선택지입니다.";

        public InvalidChoiceSelectionException() {
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

    public static class AlreadyClubMemberException extends ApplicationDomainException {
        private static final String MESSAGE = "이미 해당 동아리 소속이라 일반 모집에는 지원할 수 없습니다.";

        public AlreadyClubMemberException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class IneligibleOfficerApplicantException extends ApplicationDomainException {
        private static final String MESSAGE = "이미 운영진 권한이 있어 운영진 모집에 지원할 수 없습니다.";

        public IneligibleOfficerApplicantException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class ForbiddenApplicationAccessException extends ApplicationDomainException {
        private static final String MESSAGE = "본인의 지원 내역만 접근할 수 있습니다.";

        public ForbiddenApplicationAccessException() {
            super(MESSAGE, HttpStatus.FORBIDDEN);
        }
    }

    public static class InvalidDateRangeException extends ApplicationDomainException {
        private static final String MESSAGE = "submittedFrom 은 submittedTo 보다 늦을 수 없습니다.";

        public InvalidDateRangeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class ConcurrentStatusUpdateException extends ApplicationDomainException {
        private static final String MESSAGE = "다른 운영진이 먼저 상태를 변경했습니다. 새로고침 후 다시 시도해주세요.";

        public ConcurrentStatusUpdateException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 마감된 모집의 지원은 아카이브 데이터라 철회로 사라지지 않는다.
     * 모집 마감은 지원자에게도 공개된 사실이므로 사유를 그대로 안내하되, 내부 심사 상태(보류 등)는 노출하지 않는다.
     */
    public static class CannotWithdrawClosedRecruitmentException extends ApplicationDomainException {
        private static final String MESSAGE = "마감된 모집의 지원은 철회할 수 없어요.";

        public CannotWithdrawClosedRecruitmentException() {
            super(MESSAGE, HttpStatus.CONFLICT, ErrorCodes.RECRUITMENT_CLOSED);
        }
    }

    public static class CannotWithdrawApplicationException extends ApplicationDomainException {
        private static final String MESSAGE = "심사 중에만 철회할 수 있어요. 면접 대상 선정이나 합불 처리 이후에는 철회할 수 없습니다.";

        public CannotWithdrawApplicationException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
