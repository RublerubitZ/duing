package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.dto.command.CreateFacilityBookingCommand;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public interface FacilityBookingService {

    record CreateResult(Long bookingId, long overlappingPendingCount) {}

    record BookingSummaryResult(Long bookingId, Long facilityId, String roomName,
                                LocalDate date, LocalTime startTime, LocalTime endTime,
                                BookingStatus status, String purpose, LocalDateTime createdAt) {}

    record HistoryEntry(BookingStatus previousStatus, BookingStatus newStatus,
                        String reason, LocalDateTime changedAt) {}

    record BookingDetailResult(Long bookingId, Long facilityId, String roomName,
                               LocalDate date, LocalTime startTime, LocalTime endTime,
                               BookingStatus status, String purpose, Integer attendeeCount,
                               String contactPhone, String rejectReason, String conflictDetail,
                               List<HistoryEntry> history) {}

    /** 대관 신청 생성(설계 §5.1) — PENDING 겹침은 허용하고 개수만 알린다. */
    CreateResult create(CreateFacilityBookingCommand command);

    /** 신청 동아리의 PENDING 취소(설계 §5.4). */
    void cancel(Long clubId, Long actorId, Long bookingId);

    /** 동아리 신청 목록(최신순). status null=전체. */
    List<BookingSummaryResult> getBookings(Long clubId, Long actorId, BookingStatus status);

    /** 신청 상세 + 상태 이력(최신순). club 스코프 밖이면 NotFound. */
    BookingDetailResult getBooking(Long clubId, Long actorId, Long bookingId);
}
