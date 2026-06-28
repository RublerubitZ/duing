package com.duing.domain.publicactivity.service.dto.query;

import com.duing.domain.publicactivity.entity.PublicActivityType;
import java.time.Instant;

public record ActivityItem(
        PublicActivityType type,
        Long clubId,
        String clubName,
        Instant occurredAt
) {}
