package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.ClubStatus;

public record UpdateClubStatusCommand(
        Long clubId,
        ClubStatus status,
        String rejectionReason,
        Long actorUserId
) {}
