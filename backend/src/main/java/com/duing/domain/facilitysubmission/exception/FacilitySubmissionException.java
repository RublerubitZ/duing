package com.duing.domain.facilitysubmission.exception;

import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilitySubmissionException extends ApplicationException {

    protected FacilitySubmissionException(String message, HttpStatus status) {
        super(message, status);
    }

    protected FacilitySubmissionException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class BatchNotFoundException extends FacilitySubmissionException {
        private static final String MESSAGE = "제출 내역을 찾을 수 없습니다.";

        public BatchNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class BatchAlreadyCancelledException extends FacilitySubmissionException {
        private static final String MESSAGE = "이미 취소된 제출입니다.";

        public BatchAlreadyCancelledException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class EmptyBookingSelectionException extends FacilitySubmissionException {
        private static final String MESSAGE = "제출할 예약을 선택해주세요.";

        public EmptyBookingSelectionException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class SubmissionBookingNotFoundException extends FacilitySubmissionException {
        private static final String MESSAGE = "제출 대상 예약을 찾을 수 없습니다.";

        public SubmissionBookingNotFoundException() {
            super(MESSAGE, HttpStatus.NOT_FOUND);
        }
    }

    public static class MixedFacilityException extends FacilitySubmissionException {
        private static final String MESSAGE = "한 번의 제출에는 같은 시설의 예약만 담을 수 있습니다.";

        public MixedFacilityException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    /** all-or-nothing(스펙 §4) — 정상 UI 경로에선 발생하지 않고 동시 작업 레이스에서만 발생한다. */
    public static class BookingNotApprovedException extends FacilitySubmissionException {
        private static final String MESSAGE = "승인 완료 상태의 예약만 제출할 수 있습니다.";
        public static final String CODE = "FACILITY_SUBMISSION_NOT_APPROVED";

        public BookingNotApprovedException() {
            super(MESSAGE, HttpStatus.CONFLICT, CODE);
        }
    }

    public static class AlreadySubmittedBookingException extends FacilitySubmissionException {
        private static final String MESSAGE = "이미 제출된 예약이 포함되어 있습니다.";
        public static final String CODE = "FACILITY_SUBMISSION_ALREADY_SUBMITTED";

        public AlreadySubmittedBookingException() {
            super(MESSAGE, HttpStatus.CONFLICT, CODE);
        }
    }

    public static class InvalidCandidatePeriodException extends FacilitySubmissionException {
        private static final String MESSAGE = "조회 기간은 시작일부터 최대 31일까지 선택할 수 있습니다.";

        public InvalidCandidatePeriodException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class BatchAlreadyCompletedException extends FacilitySubmissionException {
        private static final String MESSAGE = "이미 완료 처리된 제출 목록입니다.";

        public BatchAlreadyCompletedException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }

    public static class CompletedBatchUncancellableException extends FacilitySubmissionException {
        private static final String MESSAGE = "완료된 제출 목록은 취소할 수 없습니다.";

        public CompletedBatchUncancellableException() {
            super(MESSAGE, HttpStatus.CONFLICT);
        }
    }
}
