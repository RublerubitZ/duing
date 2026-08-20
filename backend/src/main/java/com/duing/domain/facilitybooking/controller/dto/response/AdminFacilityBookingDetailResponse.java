package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.AdminBookingDetailResult;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService.OverlapContext;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AdminFacilityBookingDetailResponse(
        Long bookingId, Long clubId, String clubName,
        Long facilityId, String roomName,
        LocalDate date, LocalTime startTime, LocalTime endTime,
        BookingStatus status, String purpose,
        @JsonInclude(JsonInclude.Include.NON_NULL) Integer attendeeCount,
        String contactPhone,
        @JsonInclude(JsonInclude.Include.NON_NULL) String rejectReason,
        @JsonInclude(JsonInclude.Include.NON_NULL) String conflictDetail,
        @JsonInclude(JsonInclude.Include.NON_NULL) Long matchedScheduleSeq,
        @JsonInclude(JsonInclude.Include.NON_NULL) Instant crawlBasisAt,
        boolean stale,
        List<OverlapItem> overlaps, long overlappingPendingCount,
        List<BookingHistoryItemResponse> history
) {
    public record OverlapItem(String source, String organization, LocalTime startTime, LocalTime endTime) {
        static OverlapItem from(OverlapContext overlap) {
            return new OverlapItem(overlap.source(), overlap.organization(),
                    overlap.startTime(), overlap.endTime());
        }
    }

    public static AdminFacilityBookingDetailResponse from(AdminBookingDetailResult result) {
        return new AdminFacilityBookingDetailResponse(result.bookingId(), result.clubId(), result.clubName(),
                result.facilityId(), result.roomName(), result.date(), result.startTime(), result.endTime(),
                result.status(), result.purpose(), result.attendeeCount(), result.contactPhone(),
                result.rejectReason(),
                result.conflictDetail(), result.matchedScheduleSeq(),
                TimeMapper.seoulWallClockToInstant(result.crawlBasisAt()), result.stale(),
                result.overlaps().stream().map(OverlapItem::from).toList(), result.overlappingPendingCount(),
                result.history().stream().map(BookingHistoryItemResponse::from).toList());
    }
}
