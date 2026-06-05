package com.duing.domain.clubevent.controller.dto.request;

import com.duing.domain.clubevent.service.dto.command.CreateClubEventCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record CreateClubEventRequest(
        @NotBlank(message = "제목은 필수 입력값입니다.")
        @Size(max = 120, message = "제목은 120자 이하여야 합니다.") String title,
        @Size(max = 2000, message = "설명은 2000자 이하여야 합니다.") String description,
        @NotNull(message = "시작 시각은 필수 입력값입니다.") LocalDateTime startAt,
        @NotNull(message = "종료 시각은 필수 입력값입니다.") LocalDateTime endAt,
        @Size(max = 200, message = "장소는 200자 이하여야 합니다.") String location
) {
    public CreateClubEventCommand toCommand(Long clubId, Long createdBy) {
        return new CreateClubEventCommand(clubId, createdBy, title, description,
                startAt, endAt, location);
    }
}
