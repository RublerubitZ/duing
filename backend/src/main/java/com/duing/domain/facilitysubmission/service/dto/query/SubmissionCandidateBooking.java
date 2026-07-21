package com.duing.domain.facilitysubmission.service.dto.query;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

/** 시간표·목록 겸용 예약 행(스펙 §5.1) — submitted 는 활성 Batch 소속 여부, selectable 은 APPROVED && 미제출. */
public record SubmissionCandidateBooking(
        Long bookingId,
        // 전 시설 조회의 시설별 섹션 그룹핑용 — §5.1 v3
        Long facilityId,
        String facilityName,
        Long clubId,
        String clubName,
        String applicantName,
        String contactPhone,
        LocalDate reservationDate,
        LocalTime startTime,
        LocalTime endTime,
        String purpose,
        Integer attendeeCount,
        BookingStatus status,
        boolean submitted,
        boolean selectable,
        String submissionNo,
        String decidedByName,
        LocalDateTime decidedAt
) {
}
