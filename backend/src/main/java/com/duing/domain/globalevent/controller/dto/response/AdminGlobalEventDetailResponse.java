package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.globalevent.service.dto.query.GlobalEventAdminDetailQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDateTime;

public record AdminGlobalEventDetailResponse(
        Long id,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        String coverImageUrl,
        GlobalEventCategory category,
        CreatorRef createdBy,
        Instant createdAt,
        Instant updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    public static AdminGlobalEventDetailResponse from(GlobalEventAdminDetailQuery query) {
        return new AdminGlobalEventDetailResponse(
                query.id(), query.title(), query.description(),
                query.startAt(), query.endAt(),
                query.location(), query.linkUrl(),
                query.coverImageUrl(),
                query.category(),
                new CreatorRef(query.createdBy().id(), query.createdBy().name()),
                TimeMapper.systemWallClockToInstant(query.createdAt()),
                TimeMapper.systemWallClockToInstant(query.updatedAt())
        );
    }
}
