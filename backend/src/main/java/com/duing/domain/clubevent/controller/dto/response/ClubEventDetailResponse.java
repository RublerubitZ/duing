package com.duing.domain.clubevent.controller.dto.response;

import com.duing.domain.clubevent.entity.ClubEvent;
import com.duing.domain.user.entity.User;
import java.time.LocalDateTime;

public record ClubEventDetailResponse(
        Long id, Long clubId, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location,
        CreatorRef createdBy, LocalDateTime createdAt, LocalDateTime updatedAt
) {
    public record CreatorRef(Long id, String name) {}

    public static ClubEventDetailResponse from(ClubEvent event, User creator) {
        return new ClubEventDetailResponse(
                event.getId(), event.getClubId(), event.getTitle(), event.getDescription(),
                event.getStartAt(), event.getEndAt(), event.getLocation(),
                new CreatorRef(creator.getId(), creator.getName()),
                event.getCreatedAt(), event.getUpdatedAt()
        );
    }
}
