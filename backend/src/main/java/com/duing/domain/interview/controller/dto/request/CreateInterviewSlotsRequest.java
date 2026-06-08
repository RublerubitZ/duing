package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsRequest(
        @NotEmpty(message = "슬롯 목록은 비어있을 수 없습니다")
        @Valid
        List<SlotEntry> slots
) {

    public record SlotEntry(
            @NotNull(message = "시작 시각은 필수입니다")
            LocalDateTime startTime,

            @NotNull(message = "종료 시각은 필수입니다")
            LocalDateTime endTime,

            @Min(value = 1, message = "정원은 1 이상이어야 합니다")
            int capacity
    ) {}

    public CreateInterviewSlotsCommand toCommand(Long recruitmentId, Long actorUserId) {
        List<CreateInterviewSlotsCommand.SlotEntry> commandSlots = slots.stream()
                .map(entry -> new CreateInterviewSlotsCommand.SlotEntry(
                        entry.startTime(), entry.endTime(), entry.capacity()))
                .toList();
        return new CreateInterviewSlotsCommand(recruitmentId, actorUserId, commandSlots);
    }
}
