package com.duing.domain.clubmember.service.dto.command;

public record RemoveMemberCommand(
        Long clubId,
        Long memberId,
        Long requesterId
) {}