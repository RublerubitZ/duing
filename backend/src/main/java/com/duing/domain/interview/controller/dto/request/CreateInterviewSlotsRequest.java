package com.duing.domain.interview.controller.dto.request;

import com.duing.domain.interview.service.dto.command.CreateInterviewSlotsCommand;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record CreateInterviewSlotsRequest(
        @NotEmpty(message = "슬롯 목록은 필수 입력값입니다.")
        List<@Valid SlotItem> slots
) {
    public record SlotItem(
            @NotNull(message = "슬롯 시작 시각은 필수 입력값입니다.")
            LocalDateTime startTime,
            @NotNull(message = "슬롯 종료 시각은 필수 입력값입니다.")
            LocalDateTime endTime,
            @Min(value = 1, message = "동시 면접 인원은 1 이상이어야 합니다.")
            int capacity
    ) {}

    public CreateInterviewSlotsCommand toCommand(Long roundId, Long currentUserId) {
        List<CreateInterviewSlotsCommand.SlotItem> slotItems = slots.stream()
                .map(slot -> new CreateInterviewSlotsCommand.SlotItem(
                        slot.startTime(), slot.endTime(), slot.capacity()))
                .toList();
        return new CreateInterviewSlotsCommand(roundId, currentUserId, slotItems);
    }
}
