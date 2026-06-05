package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record GlobalEventDetailResponse(
        Long id,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category
) {
    public static GlobalEventDetailResponse from(GlobalEvent event) {
        return new GlobalEventDetailResponse(
                event.getId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getLinkUrl(), event.getCategory()
        );
    }
}
