package com.duing.domain.publicactivity.controller.dto.response;

import com.duing.domain.publicactivity.entity.PublicActivityType;
import com.duing.domain.publicactivity.service.dto.query.ActivityItem;
import java.time.Instant;
import java.util.List;

public record PublicActivityResponse(List<Item> items) {

    public record Item(PublicActivityType type, Long clubId, String clubName, Instant occurredAt) {}

    public static PublicActivityResponse from(List<ActivityItem> activityItems) {
        return new PublicActivityResponse(activityItems.stream()
                .map(activityItem -> new Item(
                        activityItem.type(),
                        activityItem.clubId(),
                        activityItem.clubName(),
                        activityItem.occurredAt()))
                .toList());
    }
}
