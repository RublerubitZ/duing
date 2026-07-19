package com.duing.domain.facilitysubmission.service.export;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record SubmissionExportRow(
        LocalDate reservationDate,
        LocalTime startTime,
        LocalTime endTime,
        String clubName,
        String applicantName,
        String contactPhone,
        Integer attendeeCount,
        String purpose,
        String deciderName,
        LocalDateTime decidedAt
) {
}
