package com.duing.domain.clubmember.service.dto.command;

import com.duing.domain.clubmember.entity.ClubMemberRole;

public record UpdateMemberRoleCommand(
        Long clubId,
        Long memberId,
        Long requesterId,
        ClubMemberRole role
) {}