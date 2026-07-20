package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.user.entity.User;
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

    public static AdminGlobalEventDetailResponse from(GlobalEvent event, User creator) {
        return new AdminGlobalEventDetailResponse(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(),
                event.getCoverImageUrl(),
                event.getCategory(),
                new CreatorRef(creator.getId(), creator.getName()),
                TimeMapper.systemWallClockToInstant(event.getCreatedAt()),
                TimeMapper.systemWallClockToInstant(event.getUpdatedAt())
        );
    }
}
