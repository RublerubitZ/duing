package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDateTime;
import java.util.List;

/** 완료 처리 결과(스펙 §4.3) — best-effort 전이의 투명한 요약. skippedCount 는 응답 계층이 파생한다. */
public record CompleteSubmissionBatchResult(
        int totalCount,
        int confirmedCount,
        LocalDateTime completedAt,
        List<SkippedBooking> skippedBookings
) {
    /** reason = 사람이 읽는 한글 라벨(Formatter 단일 출처) — FE 가 상태 코드를 재매핑하지 않는다. */
    public record SkippedBooking(Long bookingId, BookingStatus status, String reason) {
    }
}
