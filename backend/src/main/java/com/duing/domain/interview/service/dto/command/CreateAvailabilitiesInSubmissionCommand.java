package com.duing.domain.interview.service.dto.command;

import java.util.List;

public record CreateAvailabilitiesInSubmissionCommand(
        Long applicationId,
        Long recruitmentId,
        List<Long> interviewSlotIds
) {}
