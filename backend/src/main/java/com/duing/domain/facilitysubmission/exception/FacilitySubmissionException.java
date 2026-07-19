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
        public BatchNotFoundException() {
            super("제출 내역을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class BatchAlreadyCancelledException extends FacilitySubmissionException {
        public BatchAlreadyCancelledException() {
            super("이미 취소된 제출입니다.", HttpStatus.CONFLICT);
        }
    }

    public static class EmptyBookingSelectionException extends FacilitySubmissionException {
        public EmptyBookingSelectionException() {
            super("제출할 예약을 선택해주세요.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class SubmissionBookingNotFoundException extends FacilitySubmissionException {
        public SubmissionBookingNotFoundException() {
            super("제출 대상 예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class MixedFacilityException extends FacilitySubmissionException {
        public MixedFacilityException() {
            super("한 번의 제출에는 같은 시설의 예약만 담을 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    /** all-or-nothing(스펙 §4) — 정상 UI 경로에선 발생하지 않고 동시 작업 레이스에서만 발생한다. */
    public static class BookingNotApprovedException extends FacilitySubmissionException {
        public static final String CODE = "FACILITY_SUBMISSION_NOT_APPROVED";

        public BookingNotApprovedException() {
            super("승인 완료 상태의 예약만 제출할 수 있습니다.", HttpStatus.CONFLICT, CODE);
        }
    }

    public static class AlreadySubmittedBookingException extends FacilitySubmissionException {
        public static final String CODE = "FACILITY_SUBMISSION_ALREADY_SUBMITTED";

        public AlreadySubmittedBookingException() {
            super("이미 제출된 예약이 포함되어 있습니다.", HttpStatus.CONFLICT, CODE);
        }
    }

    public static class InvalidCandidatePeriodException extends FacilitySubmissionException {
        public InvalidCandidatePeriodException() {
            super("조회 기간은 시작일부터 최대 31일까지 선택할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
