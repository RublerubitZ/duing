package com.duing.domain.facilitysubmission.controller.dto.response;

import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidateBooking;
import com.duing.domain.facilitysubmission.service.dto.query.SubmissionCandidatesResult;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;

public record SubmissionCandidatesResponse(Summary summary, List<Booking> bookings) {

    public record Summary(long approvedCount, long awaitingCount, long submittedCount, long confirmedCount) {
    }

    public record Booking(
            Long bookingId,
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
        public static Booking from(SubmissionCandidateBooking candidate) {
            return new Booking(candidate.bookingId(), candidate.facilityId(), candidate.facilityName(),
                    candidate.clubId(), candidate.clubName(),
                    candidate.applicantName(), candidate.contactPhone(), candidate.reservationDate(),
                    candidate.startTime(), candidate.endTime(), candidate.purpose(), candidate.attendeeCount(),
                    candidate.status(), candidate.submitted(), candidate.selectable(), candidate.submissionNo(),
                    candidate.decidedByName(), candidate.decidedAt());
        }
    }

    public static SubmissionCandidatesResponse from(SubmissionCandidatesResult result) {
        return new SubmissionCandidatesResponse(
                new Summary(result.summary().approvedCount(), result.summary().awaitingCount(),
                        result.summary().submittedCount(), result.summary().confirmedCount()),
                result.bookings().stream().map(Booking::from).toList());
    }
}
