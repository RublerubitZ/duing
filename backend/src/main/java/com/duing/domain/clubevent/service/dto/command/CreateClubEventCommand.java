package com.duing.domain.clubevent.service.dto.command;

import java.time.LocalDateTime;

public record CreateClubEventCommand(
        Long clubId, Long createdBy, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location
) {}
