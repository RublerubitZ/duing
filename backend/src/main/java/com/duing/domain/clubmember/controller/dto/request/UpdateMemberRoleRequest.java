package com.duing.domain.clubmember.controller.dto.request;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.command.UpdateMemberRoleCommand;
import jakarta.validation.constraints.NotNull;

public record UpdateMemberRoleRequest(
        @NotNull(message = "role 은 필수입니다.")
        ClubMemberRole role
) {
    public UpdateMemberRoleCommand toCommand(Long clubId, Long memberId, Long requesterId) {
        return new UpdateMemberRoleCommand(clubId, memberId, requesterId, role);
    }
}