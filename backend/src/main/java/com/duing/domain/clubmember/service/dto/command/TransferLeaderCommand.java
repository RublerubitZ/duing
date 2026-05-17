package com.duing.domain.clubmember.service.dto.command;

public record TransferLeaderCommand(
        Long clubId,
        Long memberId,
        Long requesterId
) {}