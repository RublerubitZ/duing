package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDateTime;

public record AdminGlobalEventSummaryResponse(
        Long id,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        GlobalEventCategory category,
        Long createdById,
        Instant createdAt,
        Instant updatedAt
) {
    public static AdminGlobalEventSummaryResponse from(GlobalEvent event) {
        return new AdminGlobalEventSummaryResponse(
                event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getCategory(),
                event.getCreatedBy(),
                TimeMapper.systemWallClockToInstant(event.getCreatedAt()),
                TimeMapper.systemWallClockToInstant(event.getUpdatedAt())
        );
    }
}
