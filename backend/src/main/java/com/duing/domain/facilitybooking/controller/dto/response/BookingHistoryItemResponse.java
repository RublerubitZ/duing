package com.duing.domain.facilitybooking.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService.HistoryEntry;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 동아리용·총동연용 예약 상세가 공통으로 노출하는 상태 변경 이력 한 줄.
 * {@code changedAt} 은 저장된 시스템 벽시계를 {@link TimeMapper} 로 {@code Instant} 변환해 내보낸다.
 */
public record BookingHistoryItemResponse(BookingStatus previousStatus, BookingStatus newStatus,
                                         String reason, Instant changedAt) {

    public static BookingHistoryItemResponse from(HistoryEntry entry) {
        return new BookingHistoryItemResponse(entry.previousStatus(), entry.newStatus(), entry.reason(),
                TimeMapper.systemWallClockToInstant(entry.changedAt()));
    }
}
