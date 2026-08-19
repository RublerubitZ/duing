package com.duing.domain.recruitment.exception;

import com.duing.global.constant.ErrorCodes;
import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class RecruitmentException extends ApplicationException {

    protected RecruitmentException(String message, HttpStatus status) {
        super(message, status);
    }

    /** 프론트가 분기할 machine-readable code 를 함께 싣는 경우에 사용한다. */
    protected RecruitmentException(String message, HttpStatus status, String code) {
        super(message, status, code);
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

    /**
     * 종료일이 이미 지난 공고는 생성(또는 변경) 즉시 만료-OPEN — 한 번도 학생에게
     * 열리지 않은 "마감 공고"가 되므로 차단한다. 수정은 종료일을 과거로 바꾸는 경우만
     * 해당하고, 만료-OPEN 공고의 다른 필드 편집(기존 과거 종료일 재전송)은 허용한다.
     */
    public static class PastEndDateException extends RecruitmentException {
        private static final String MESSAGE = "모집 종료일은 오늘 이후여야 합니다.";

        public PastEndDateException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 마감된 공고를 수정하거나 다시 마감하려는 경우. 원인이 "마감된 모집에 쓰기"로
     * {@link ClosedRecruitmentReadOnlyException} 과 같으므로 code 를 공유해,
     * 프론트가 마감 관련 실패를 단일 분기로 처리할 수 있게 한다.
     */
    public static class RecruitmentAlreadyClosedException extends RecruitmentException {
        private static final String MESSAGE = "이미 마감된 모집 공고입니다.";

        public RecruitmentAlreadyClosedException() {
            super(MESSAGE, HttpStatus.CONFLICT, ErrorCodes.RECRUITMENT_CLOSED);
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

    /**
     * 접수 마감(stopIntake)은 상시모집(endDate=null) 전용이다. 기간모집은 종료일 경과로,
     * 이미 접수 마감된 모집은 확정된 종료일로 같은 상태에 도달하므로 모두 이 예외로 수렴한다.
     */
    public static class StopIntakeRequiresAlwaysOpenException extends RecruitmentException {
        private static final String MESSAGE = "상시모집 공고만 접수를 마감할 수 있습니다.";

        public StopIntakeRequiresAlwaysOpenException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * 접수 마감은 종료일을 어제로 확정하므로 기간 불변식(endDate >= startDate)을 지키려면
     * 시작일이 오늘보다 과거여야 한다. 시작일 당일·미래 시작 상시모집이 모두 해당한다 —
     * 당일 즉시 종료가 필요하면 모집 종료(close)를 쓴다.
     */
    public static class StopIntakeTooEarlyException extends RecruitmentException {
        private static final String MESSAGE = "모집 시작일 다음 날부터 접수를 마감할 수 있습니다.";

        public StopIntakeTooEarlyException() {
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

    public static class QuestionsNotEditableWithApplicationsException extends RecruitmentException {
        private static final String MESSAGE =
                "이미 지원자가 있는 모집 공고는 질문을 수정할 수 없습니다. 기존 지원서의 답변이 질문과 어긋나기 때문입니다.";

        public QuestionsNotEditableWithApplicationsException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 가입 코드로 접수된 미처리 요청이 남은 모집은 삭제할 수 없다 (스펙 v2 4.2).
     * 학생이 이미 코드 자리를 차감한 채 응답을 기다리는 상태라, 삭제하면 응답 경로가 사라진다.
     */
    public static class PendingJoinRequestsExistException extends RecruitmentException {
        private static final String MESSAGE = "처리되지 않은 가입 요청이 있습니다. 먼저 승인하거나 거절해주세요.";

        public PendingJoinRequestsExistException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class OpenRecruitmentNotDeletableException extends RecruitmentException {
        private static final String MESSAGE = "진행 중인 모집 공고는 마감한 뒤에 삭제할 수 있습니다.";

        public OpenRecruitmentNotDeletableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    /**
     * 마감(CLOSED)된 모집은 아카이브 — 지원 상태 변경·평가 저장/삭제·면접 라운드 생성 등
     * 운영진의 모든 쓰기를 막고 조회만 허용한다. 지원자용 철회 차단
     * ({@code ApplicationDomainException.CannotWithdrawClosedRecruitmentException}) 과 같은 원인이므로
     * code 를 공유해 프론트가 한 분기로 처리한다.
     */
    public static class ClosedRecruitmentReadOnlyException extends RecruitmentException {
        private static final String MESSAGE = "마감된 모집에서는 할 수 없는 작업입니다.";

        public ClosedRecruitmentReadOnlyException() {
            super(MESSAGE, HttpStatus.CONFLICT, ErrorCodes.RECRUITMENT_CLOSED);
        }
    }

    public static class InvalidQuestionDefinitionException extends RecruitmentException {
        public InvalidQuestionDefinitionException(String message) {
            super(message, HttpStatus.BAD_REQUEST);
        }
    }
}
