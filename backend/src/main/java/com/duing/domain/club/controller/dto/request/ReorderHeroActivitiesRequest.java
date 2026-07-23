package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand;
import com.duing.domain.club.heroactivity.service.dto.command.ReorderHeroActivitiesCommand.HeroOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ReorderHeroActivitiesRequest(
        @NotEmpty(message = "정렬할 대표 활동이 비어 있습니다.")
        @Valid
        List<HeroOrderItem> items
) {
    public ReorderHeroActivitiesCommand toCommand(Long clubId, Long requesterId) {
        return new ReorderHeroActivitiesCommand(
                clubId,
                requesterId,
                items.stream()
                        .map(item -> new HeroOrder(item.heroActivityId(), item.displayOrder()))
                        .toList()
        );
    }

    public record HeroOrderItem(
            @NotNull(message = "heroActivityId 는 필수입니다.") Long heroActivityId,
            @Min(value = 1, message = "대표 활동 순서는 1~6 사이여야 합니다.")
            @Max(value = 6, message = "대표 활동 순서는 1~6 사이여야 합니다.") int displayOrder
    ) {}
}
