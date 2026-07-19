package com.duing.domain.facilitysubmission.service.dto.query;

import java.util.List;

public record SubmissionCandidatesResult(SubmissionSummaryCounts summary, List<SubmissionCandidateBooking> bookings) {
}
