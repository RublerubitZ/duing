package com.duing.domain.facilitysubmission.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.CompleteSubmissionBatchResult.SkippedBooking;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SubmissionCompletionSummaryFormatterTest {

    private final SubmissionCompletionSummaryFormatter formatter = new SubmissionCompletionSummaryFormatter();

    @Test
    @DisplayName("스킵 사유는 운영자가 읽는 한글 라벨로 변환된다")
    void reasonLabelsAreHumanReadable() {
        assertThat(formatter.reasonLabel(BookingStatus.CANCELLED)).isEqualTo("취소됨");
        assertThat(formatter.reasonLabel(BookingStatus.CONFLICT)).isEqualTo("충돌");
        assertThat(formatter.reasonLabel(BookingStatus.CONFIRMED)).isEqualTo("이미 등록 완료");
        assertThat(formatter.reasonLabel(BookingStatus.PENDING)).isEqualTo("승인 대기");
        assertThat(formatter.reasonLabel(BookingStatus.REJECTED)).isEqualTo("반려됨");
    }

    @Test
    @DisplayName("제외가 없으면 총·등록 건수만으로 요약한다")
    void summaryWithoutSkipsOmitsExclusionClause() {
        assertThat(formatter.summarize(8, 8, List.of()))
                .isEqualTo("학교 제출 완료 — 총 8건 / 등록 완료 8건");
    }

    @Test
    @DisplayName("제외가 있으면 예약별 사유가 나열된다")
    void summaryListsSkippedBookingsWithReasons() {
        List<SkippedBooking> skipped = List.of(
                new SkippedBooking(123L, BookingStatus.CANCELLED, "취소됨"),
                new SkippedBooking(531L, BookingStatus.CONFLICT, "충돌"));

        assertThat(formatter.summarize(10, 8, skipped))
                .isEqualTo("학교 제출 완료 — 총 10건 / 등록 완료 8건 / 제외 2건: 예약 #123(취소됨), 예약 #531(충돌)");
    }
}
