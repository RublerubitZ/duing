package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.SlotsCreationResult;
import java.util.List;

public record CreateInterviewSlotsResponse(List<Long> createdSlotIds, int reinvitedMemberCount) {
    public static CreateInterviewSlotsResponse from(SlotsCreationResult result) {
        return new CreateInterviewSlotsResponse(result.createdSlotIds(), result.reinvitedMemberCount());
    }
}
