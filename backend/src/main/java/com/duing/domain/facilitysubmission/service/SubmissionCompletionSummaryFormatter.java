package com.duing.domain.facilitysubmission.service;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * 완료 처리의 사람이 읽는 표현 단일 출처(스펙 §4.3 v2.2 보완) — 응답 reason 과 감사 요약이 같은 라벨을 쓴다.
 * 문구·다국어·포맷 변경은 이 클래스에서만 이뤄진다(서비스는 호출만).
 */
@Component
public class SubmissionCompletionSummaryFormatter {

    private static final Map<BookingStatus, String> SKIP_REASON_LABELS = Map.of(
            BookingStatus.CANCELLED, "취소됨",
            BookingStatus.CONFLICT, "충돌",
            BookingStatus.CONFIRMED, "이미 등록 완료",
            BookingStatus.PENDING, "승인 대기",
            BookingStatus.REJECTED, "반려됨");

    public String reasonLabel(BookingStatus status) {
        return SKIP_REASON_LABELS.getOrDefault(status, status.name());
    }

    /** 감사 detail 요약(§4.3) — 요약 수치가 앞이라 500자 절단에도 핵심은 보존된다. */
    public String summarize(int totalCount, int confirmedCount,
            List<CompleteSubmissionBatchResult.SkippedBooking> skippedBookings) {
        StringBuilder summary = new StringBuilder()
                .append("학교 제출 완료 — 총 ").append(totalCount).append("건 / 등록 완료 ")
                .append(confirmedCount).append("건");
        if (!skippedBookings.isEmpty()) {
            summary.append(" / 제외 ").append(skippedBookings.size()).append("건: ");
            for (int index = 0; index < skippedBookings.size(); index++) {
                CompleteSubmissionBatchResult.SkippedBooking skipped = skippedBookings.get(index);
                if (index > 0) summary.append(", ");
                summary.append("예약 #").append(skipped.bookingId())
                        .append('(').append(skipped.reason()).append(')');
            }
        }
        return summary.toString();
    }
}
