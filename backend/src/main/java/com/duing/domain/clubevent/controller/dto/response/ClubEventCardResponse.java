package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.entity.ClubEvent;
import java.time.LocalDateTime;

public record ClubEventCardResponse(
        Long id, String title, LocalDateTime startAt, LocalDateTime endAt, String location
) {
    public static ClubEventCardResponse from(ClubEvent event) {
        return new ClubEventCardResponse(event.getId(), event.getTitle(),
                event.getStartAt(), event.getEndAt(), event.getLocation());
    }
}
