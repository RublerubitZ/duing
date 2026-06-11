package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.RespondInterviewAvailabilityCommand;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record RespondInterviewAvailabilityRequest(
        // 슬롯 선택 경로. noAvailableSlot 과 XOR — 위반은 서비스가 400 으로 거부한다.
        List<@NotNull(message = "슬롯 ID 는 null 이 될 수 없습니다.") Long> slotIds,
        Boolean noAvailableSlot,
        @Size(max = 500, message = "대체 가능시간은 500자 이하여야 합니다.")
        String alternativeText
) {
    public RespondInterviewAvailabilityCommand toCommand(Long applicationId, Long currentUserId) {
        return new RespondInterviewAvailabilityCommand(
                applicationId, currentUserId, slotIds,
                Boolean.TRUE.equals(noAvailableSlot), alternativeText);
    }
}
