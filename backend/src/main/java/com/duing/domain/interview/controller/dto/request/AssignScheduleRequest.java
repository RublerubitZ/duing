package com.duing.domain.interview.controller.dto.request;

import jakarta.validation.constraints.NotNull;

public record AssignScheduleRequest(
        @NotNull(message = "배정할 슬롯을 선택해야 합니다.")
        Long slotId
) {}
