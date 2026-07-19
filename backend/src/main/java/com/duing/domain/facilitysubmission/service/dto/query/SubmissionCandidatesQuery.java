package com.duing.domain.facilitysubmission.service.dto.query;

import java.time.LocalDate;

public record SubmissionCandidatesQuery(Long facilityId, LocalDate startDate, LocalDate endDate, Long clubId) {
}
