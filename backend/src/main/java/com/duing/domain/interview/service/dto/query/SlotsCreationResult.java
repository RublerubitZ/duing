package com.duing.domain.interview.service.dto.query;

import java.util.List;

public record SlotsCreationResult(List<Long> createdSlotIds, int reinvitedMemberCount) {}
