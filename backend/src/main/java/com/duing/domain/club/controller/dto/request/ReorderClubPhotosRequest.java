package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record ReorderClubPhotosRequest(
        @NotEmpty(message = "정렬할 사진이 비어 있습니다.")
        @Valid
        List<PhotoOrderItem> items
) {
    public ReorderClubPhotosCommand toCommand(Long clubId, Long requesterId) {
        return new ReorderClubPhotosCommand(
                clubId,
                requesterId,
                items.stream().map(item -> new PhotoOrder(item.photoId(), item.displayOrder())).toList()
        );
    }

    public record PhotoOrderItem(
            @NotNull(message = "photoId 는 필수입니다.") Long photoId,
            @PositiveOrZero(message = "displayOrder 는 0 이상이어야 합니다.") int displayOrder
    ) {}
}
