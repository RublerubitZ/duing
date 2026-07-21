package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.util.List;

public record CompleteSubmissionBatchResponse(
        int totalCount,
        int confirmedCount,
        int skippedCount,
        Instant completedAt,
        List<SkippedBookingResponse> skippedBookings
) {
    /** reason = 서비스가 내려준 한글 라벨 그대로(Formatter 단일 출처) — FE 재매핑 금지 계약. */
    public record SkippedBookingResponse(Long bookingId, BookingStatus status, String reason) {
    }

    public static CompleteSubmissionBatchResponse from(CompleteSubmissionBatchResult result) {
        return new CompleteSubmissionBatchResponse(
                result.totalCount(), result.confirmedCount(), result.skippedBookings().size(),
                TimeMapper.seoulWallClockToInstant(result.completedAt()),
                result.skippedBookings().stream()
                        .map(skipped -> new SkippedBookingResponse(
                                skipped.bookingId(), skipped.status(), skipped.reason()))
                        .toList());
    }
}
