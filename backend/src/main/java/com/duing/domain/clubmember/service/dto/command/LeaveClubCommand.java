package com.duing.domain.clubmember.service.dto.command;

public record LeaveClubCommand(
        Long clubId,
        Long requesterId
) {}