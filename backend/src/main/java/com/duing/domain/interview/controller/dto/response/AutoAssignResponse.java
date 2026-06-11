package com.duing.domain.interview.controller.dto.response;

import com.duing.domain.interview.service.dto.query.AutoAssignResult;

public record AutoAssignResponse(int assignedMemberCount, int unassignedMemberCount) {
    public static AutoAssignResponse from(AutoAssignResult result) {
        return new AutoAssignResponse(result.assignedMemberCount(), result.unassignedMemberCount());
    }
}
