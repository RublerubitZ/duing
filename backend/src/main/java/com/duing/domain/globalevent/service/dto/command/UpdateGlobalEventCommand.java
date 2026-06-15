package com.duing.domain.globalevent.service.dto.command;

import com.duing.domain.globalevent.entity.GlobalEventCategory;
import java.time.LocalDateTime;

public record UpdateGlobalEventCommand(
        Long eventId,
        String title,
        String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        String location,
        String linkUrl,
        GlobalEventCategory category,
        String coverImageUrl,
        Boolean clearCoverImage
) {}
