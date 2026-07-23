package com.duing.domain.club.heroactivity.service.dto.command;

import java.util.List;

public record ReorderHeroActivitiesCommand(
        Long clubId,
        Long requesterId,
        List<HeroOrder> orders
) {
    public record HeroOrder(Long heroActivityId, int displayOrder) {}
}
