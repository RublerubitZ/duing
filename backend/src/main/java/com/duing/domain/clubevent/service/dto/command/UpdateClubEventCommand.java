package com.duing.domain.clubevent.service.dto.command;

import java.time.LocalDateTime;

public record UpdateClubEventCommand(
        Long clubId, Long eventId, String title, String description,
        LocalDateTime startAt, LocalDateTime endAt, String location
) {}
