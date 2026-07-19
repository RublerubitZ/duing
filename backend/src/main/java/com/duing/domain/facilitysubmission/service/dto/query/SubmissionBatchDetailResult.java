package com.duing.domain.facilitysubmission.service.dto.query;

import java.util.List;

public record SubmissionBatchDetailResult(SubmissionBatchListItem batch, List<SubmissionCandidateBooking> bookings) {
}
