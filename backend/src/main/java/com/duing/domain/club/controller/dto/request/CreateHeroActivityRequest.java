package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.heroactivity.service.dto.command.CreateHeroActivityCommand;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CreateHeroActivityRequest(
        @NotNull(message = "clubPhotoId 는 필수입니다.")
        Long clubPhotoId,

        @NotBlank(message = "제목은 필수입니다.")
        @Size(max = 30, message = "제목은 30자 이하여야 합니다.")
        String title,

        @NotBlank(message = "설명은 필수입니다.")
        @Size(max = 80, message = "설명은 80자 이하여야 합니다.")
        String description,

        @Min(value = 1, message = "대표 활동 순서는 1~6 사이여야 합니다.")
        @Max(value = 6, message = "대표 활동 순서는 1~6 사이여야 합니다.")
        int displayOrder
) {
    public CreateHeroActivityCommand toCommand(Long clubId, Long requesterId) {
        return new CreateHeroActivityCommand(
                clubId, requesterId, clubPhotoId, title, description, displayOrder);
    }
}
