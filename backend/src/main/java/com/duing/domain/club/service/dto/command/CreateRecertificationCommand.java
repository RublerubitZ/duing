package com.duing.domain.club.service.dto.command;

public record CreateRecertificationCommand(
        Long clubId,
        Long requesterUserId,
        String contactEmail,
        String contactPhone,
        int operatingYear,
        String notes
) {}
