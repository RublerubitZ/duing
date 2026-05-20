package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.service.dto.command.CreateClubCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateClubRequest(
        @NotBlank(message = "동아리 이름은 필수 입력값입니다.")
        @Size(max = 100, message = "동아리 이름은 100자 이하여야 합니다.")
        String name,

        @NotNull(message = "동아리 카테고리는 필수 입력값입니다.")
        ClubCategory category,

        @Size(max = 50, message = "분류는 50자 이하여야 합니다.")
        String division,

        String description,

        @Size(max = 500, message = "로고 URL은 500자 이하여야 합니다.")
        String logoUrl,

        @NotNull(message = "동아리장 ID는 필수 입력값입니다.")
        Long leaderId,

        boolean centralClub
) {
    public CreateClubCommand toCommand() {
        return new CreateClubCommand(name, category, division, description, logoUrl, leaderId, centralClub);
    }
}
