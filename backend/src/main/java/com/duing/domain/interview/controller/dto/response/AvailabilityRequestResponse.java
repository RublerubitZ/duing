package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.AvailabilityRequestResult;

public record AvailabilityRequestResponse(int notifiedMemberCount) {
    public static AvailabilityRequestResponse from(AvailabilityRequestResult result) {
        return new AvailabilityRequestResponse(result.notifiedMemberCount());
    }
}
