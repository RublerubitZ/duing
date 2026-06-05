package com.duing.domain.clubevent.controller.dto.request;

import com.duing.domain.clubevent.service.dto.command.UpdateClubEventCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateClubEventRequest(
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        LocalDateTime startAt,
        LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location
) {
    public UpdateClubEventCommand toCommand(Long clubId, Long eventId) {
        return new UpdateClubEventCommand(clubId, eventId, title, description,
                startAt, endAt, location);
    }
}
