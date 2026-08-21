package com.duing.domain.globalevent.service.dto.query;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;

public record GlobalEventAdminDetailQuery(
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
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    public static GlobalEventAdminDetailQuery of(GlobalEvent event, User creator) {
        return new GlobalEventAdminDetailQuery(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(),
                event.getCoverImageUrl(),
                event.getCategory(),
                new CreatorRef(creator.getId(), creator.getName()),
                event.getCreatedAt(), event.getUpdatedAt());
    }
}
