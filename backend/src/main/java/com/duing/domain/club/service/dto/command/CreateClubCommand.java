package com.duing.domain.club.service.dto.command;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.user.entity.College;

public record CreateClubCommand(
        String name,
        ClubCategory category,
        String division,
        String description,
        String logoUrl,
        Long leaderId,
        boolean centralClub,
        College college,
        String department
) {}
