package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.UpdateClubPhotoCommand;
import jakarta.validation.constraints.Size;

public record UpdateClubPhotoRequest(
        @Size(max = 200, message = "캡션은 200자 이하여야 합니다.")
        String caption
) {
    public UpdateClubPhotoCommand toCommand(Long clubId, Long requesterId, Long photoId) {
        return new UpdateClubPhotoCommand(clubId, requesterId, photoId, caption);
    }
}