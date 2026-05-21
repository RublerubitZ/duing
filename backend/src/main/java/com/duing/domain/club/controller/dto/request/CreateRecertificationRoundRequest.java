package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.service.dto.command.OpenRoundCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateRecertificationRoundRequest(
        @Min(value = 2000, message = "연도는 2000 이상이어야 합니다.")
        @Max(value = 2100, message = "연도는 2100 이하여야 합니다.") int year,
        @NotBlank(message = "라운드 라벨은 필수입니다.")
        @Size(max = 100, message = "라벨은 100자 이하여야 합니다.") String label
) {
    public OpenRoundCommand toCommand(Long openedBy) {
        return new OpenRoundCommand(year, label, openedBy);
    }
}
