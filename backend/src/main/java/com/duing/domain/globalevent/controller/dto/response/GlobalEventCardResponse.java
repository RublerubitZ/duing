package com.duing.domain.globalevent.controller.dto.response;

import com.duing.domain.globalevent.entity.GlobalEvent;
import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record GlobalEventCardResponse(
        Long id,
        String title,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        GlobalEventCategory category
) {
    public static GlobalEventCardResponse from(GlobalEvent event) {
        return new GlobalEventCardResponse(
                event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(),
                event.getLocation(), event.getCategory()
        );
    }
}
