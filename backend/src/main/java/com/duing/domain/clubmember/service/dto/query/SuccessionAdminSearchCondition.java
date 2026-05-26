package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.SuccessionStatus;

public record SuccessionAdminSearchCondition(
        SuccessionStatus status,
        Long clubId
) {}
