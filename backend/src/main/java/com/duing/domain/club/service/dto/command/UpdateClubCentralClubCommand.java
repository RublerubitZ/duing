package com.duing.domain.club.service.dto.command;

public record UpdateClubCentralClubCommand(
        Long clubId,
        boolean centralClub
) {}
