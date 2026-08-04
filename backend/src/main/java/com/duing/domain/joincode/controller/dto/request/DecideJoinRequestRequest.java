package com.duing.domain.joincode.controller.dto.request;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.command.DecideJoinRequestCommand;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotNull;

public record DecideJoinRequestRequest(
        @NotNull(message = "처리 상태는 필수 입력값입니다.")
        JoinRequestStatus status
) {
    /** PENDING 은 처리 결과가 아니므로 경계에서 막는다 — 서비스가 승인으로 오인하는 경로를 없앤다. */
    @AssertTrue(message = "처리 상태는 APPROVED 또는 REJECTED 여야 합니다.")
    public boolean isDecisionStatus() {
        return status == null || status == JoinRequestStatus.APPROVED
                || status == JoinRequestStatus.REJECTED;
    }

    public DecideJoinRequestCommand toCommand(Long clubId, Long joinRequestId, Long requesterId) {
        return new DecideJoinRequestCommand(clubId, joinRequestId, requesterId, status);
    }
}
