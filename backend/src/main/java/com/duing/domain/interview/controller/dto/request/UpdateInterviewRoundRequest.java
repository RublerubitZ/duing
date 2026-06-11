package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.UpdateInterviewRoundCommand;
import jakarta.validation.constraints.Size;
import java.time.LocalDateTime;

public record UpdateInterviewRoundRequest(
        // 전 필드 optional — null 은 무변경 (PATCH). 전부 null 이면 서비스가 400 으로 거부한다.
        @Size(max = 100, message = "라운드 제목은 100자 이하여야 합니다.")
        String title,
        @Size(max = 200, message = "면접 장소는 200자 이하여야 합니다.")
        String location,
        LocalDateTime availabilityDeadline
) {
    public UpdateInterviewRoundCommand toCommand(Long roundId, Long currentUserId) {
        return new UpdateInterviewRoundCommand(roundId, currentUserId, title, location, availabilityDeadline);
    }
}
