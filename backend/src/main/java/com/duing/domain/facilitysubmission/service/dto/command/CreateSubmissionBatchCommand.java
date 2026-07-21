package com.duing.domain.facilitysubmission.service.dto.command;

import java.util.List;

public record CreateSubmissionBatchCommand(List<Long> bookingIds, String memo) {
}
