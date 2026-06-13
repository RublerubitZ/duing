package com.duing.domain.club.service.dto.command;

public record CloseClubCommand(
        Long clubId,
        Long actorUserId,
        String closureReason
) {}
