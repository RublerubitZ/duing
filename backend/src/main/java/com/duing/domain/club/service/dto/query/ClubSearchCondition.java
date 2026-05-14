package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;

public record ClubSearchCondition(
        ClubCategory category,
        String division,
        String keyword
) {}
