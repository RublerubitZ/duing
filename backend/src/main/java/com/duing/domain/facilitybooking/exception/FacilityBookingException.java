package com.duing.domain.facilitybooking.exception;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.BookingWindow;
import com.duing.global.exception.ApplicationException;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
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
        public OutOfBookingWindowException(BookingWindow window) {
            super("지금은 %d월 %d일부터 %d월 %d일까지만 신청할 수 있어요.".formatted(
                            window.from().getMonthValue(), window.from().getDayOfMonth(),
                            window.until().getMonthValue(), window.until().getDayOfMonth()),
                    HttpStatus.BAD_REQUEST);
        }
    }

    public static class ActiveBookingLimitExceededException extends FacilityBookingException {
        public ActiveBookingLimitExceededException(int limit) {
            super("동아리당 진행 중인 예약 신청은 최대 " + limit + "건까지만 가능합니다.", HttpStatus.CONFLICT);
        }
    }

    public static class SlotUnavailableException extends FacilityBookingException {
        /** EXCLUDE 백스톱 발화 시 GlobalExceptionHandler 가 동일 응답을 재현하는 데 쓰는 단일 출처 상수. */
        public static final String MESSAGE = "이미 예약된 시간이 포함되어 있어 신청할 수 없습니다.";
        public static final String CODE = "FACILITY_BOOKING_SLOT_UNAVAILABLE";

        public SlotUnavailableException() {
            super(MESSAGE, HttpStatus.CONFLICT, CODE);
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

    /** 승인·수동 확정 시점의 아카이브 — 신청 접수 후 서버 측 시설 전이라 400(요청 오류)이 아닌 409
     *  (현재 상태상 처리 불가)로 구분한다. 신청 시점 검증은 ArchivedFacilityException(400) 그대로. */
    public static class ArchivedFacilityConflictException extends FacilityBookingException {
        public ArchivedFacilityConflictException() {
            super("이용이 중단된 시설이라 승인·확정할 수 없습니다.", HttpStatus.CONFLICT);
        }
    }

    /** 신청 마감(설계 spec 2026-07-18 §1) — 사용일 전날 12:01(KST)부터 거부. */
    public static class DeadlinePassedException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_DEADLINE_PASSED";

        public DeadlinePassedException() {
            super("시설 사용일 전날 12:00까지만 신청할 수 있어요.", HttpStatus.BAD_REQUEST, CODE);
        }
    }

    /** 신청 자격(설계 spec 2026-07-18 §2) — 중앙동아리만 신청 가능. */
    public static class CentralClubOnlyException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_CENTRAL_CLUB_ONLY";

        public CentralClubOnlyException() {
            super("시설 예약은 중앙동아리만 신청할 수 있어요.", HttpStatus.FORBIDDEN, CODE);
        }
    }

    /** 신청 권한(설계 spec 2026-07-18 §2) — create 한정 역할 거부. 조회·취소는 기존 AccessDenied 유지. */
    public static class PermissionDeniedException extends FacilityBookingException {
        public static final String CODE = "FACILITY_BOOKING_PERMISSION_DENIED";

        public PermissionDeniedException() {
            super("회장 또는 운영진만 시설 예약을 신청할 수 있어요.", HttpStatus.FORBIDDEN, CODE);
        }
    }

    public static class SchoolConflictException extends FacilityBookingException {

        /** 겹치는 학교 점유행 1건 — FE 충돌 안내(§8.3 data.conflicts[])용. */
        public record ConflictItem(String organization, LocalTime startTime, LocalTime endTime) {}

        // transient — 예외 직렬화(Serializable) 대상에서 제외한다. 응답 payload 는 도메인 어드바이스가 읽는다.
        private final transient List<ConflictItem> conflicts;
        private final LocalDateTime crawlBasisAt;

        public SchoolConflictException(List<ConflictItem> conflicts, LocalDateTime crawlBasisAt) {
            super("학교 예약과 시간이 충돌하여 승인할 수 없습니다.",
                    HttpStatus.CONFLICT, "FACILITY_BOOKING_SCHOOL_CONFLICT");
            this.conflicts = conflicts;
            this.crawlBasisAt = crawlBasisAt;
        }

        public List<ConflictItem> getConflicts() {
            return conflicts;
        }

        /** 충돌 판단에 사용한 크롤 스냅샷 수집 시각(§8.3 data.crawlBasisAt). 스냅샷 없으면 null. */
        public LocalDateTime getCrawlBasisAt() {
            return crawlBasisAt;
        }
    }
}
