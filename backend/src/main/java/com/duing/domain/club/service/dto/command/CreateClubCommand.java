package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.ClubCategory;

public record CreateClubCommand(
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        Long leaderId,
        boolean centralClub
) {}
