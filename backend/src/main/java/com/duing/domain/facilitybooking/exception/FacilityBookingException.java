package com.duing.domain.facilitybooking.exception;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.global.exception.ApplicationException;
import org.springframework.http.HttpStatus;

public class FacilityBookingException extends ApplicationException {

    protected FacilityBookingException(String message, HttpStatus status) {
        super(message, status);
    }

    protected FacilityBookingException(String message, HttpStatus status, String code) {
        super(message, status, code);
    }

    public static class BookingNotFoundException extends FacilityBookingException {
        public BookingNotFoundException() {
            super("예약 신청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
        }
    }

    public static class MonthOutOfBookingRangeException extends FacilityBookingException {
        public MonthOutOfBookingRangeException() {
            super("예약 가능 기간이 아닙니다. 이번 달과 다음 달만 조회할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class InvalidSlotRangeException extends FacilityBookingException {
        public InvalidSlotRangeException() {
            super("예약 시간은 09:00~22:00 사이의 정시 단위(1시간 슬롯)로 선택해야 합니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class OutOfBookingWindowException extends FacilityBookingException {
        public OutOfBookingWindowException() {
            super("오늘부터 다음 달 말일까지의 미래 시간만 신청할 수 있습니다.", HttpStatus.BAD_REQUEST);
        }
    }

    public static class ActiveBookingLimitExceededException extends FacilityBookingException {
        public ActiveBookingLimitExceededException(int limit) {
            super("동아리당 진행 중인 예약 신청은 최대 " + limit + "건까지만 가능합니다.", HttpStatus.CONFLICT);
        }
    }

    public static class SlotUnavailableException extends FacilityBookingException {
        public SlotUnavailableException() {
            super("이미 예약된 시간이 포함되어 있어 신청할 수 없습니다.",
                    HttpStatus.CONFLICT, "FACILITY_BOOKING_SLOT_UNAVAILABLE");
        }
    }

    public static class DuplicateClubBookingException extends FacilityBookingException {
        public DuplicateClubBookingException() {
            super("같은 시간에 이미 우리 동아리의 예약 신청이 있습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class InvalidStatusTransitionException extends FacilityBookingException {
        public InvalidStatusTransitionException(BookingStatus from, BookingStatus to) {
            super("현재 상태(" + from + ")에서는 " + to + " 로 변경할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    public static class ArchivedFacilityException extends FacilityBookingException {
        public ArchivedFacilityException() {
            super("현재 예약 신청을 받을 수 없는 시설입니다.", HttpStatus.BAD_REQUEST);
        }
    }
}
