package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.RecertificationStatus;

public record RecertificationAdminSearchCondition(
        Long roundId,
        RecertificationStatus status
) {}
