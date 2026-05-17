package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.CreateClubPhotoCommand;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record CreateClubPhotoRequest(
        @NotBlank(message = "storageKey 는 필수입니다.")
        @Size(max = 500, message = "storageKey 는 500자 이하여야 합니다.")
        String storageKey,

        @Size(max = 200, message = "캡션은 200자 이하여야 합니다.")
        String caption,

        @PositiveOrZero(message = "width 는 0 이상이어야 합니다.")
        Integer width,

        @PositiveOrZero(message = "height 는 0 이상이어야 합니다.")
        Integer height
) {
    public CreateClubPhotoCommand toCommand(Long clubId, Long requesterId) {
        return new CreateClubPhotoCommand(clubId, requesterId, storageKey, caption, width, height);
    }
}
