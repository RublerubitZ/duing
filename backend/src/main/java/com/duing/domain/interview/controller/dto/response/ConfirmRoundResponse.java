package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.ConfirmResult;

public record ConfirmRoundResponse(int assignedMemberCount, int excludedMemberCount) {
    public static ConfirmRoundResponse from(ConfirmResult result) {
        return new ConfirmRoundResponse(result.assignedMemberCount(), result.excludedMemberCount());
    }
}
