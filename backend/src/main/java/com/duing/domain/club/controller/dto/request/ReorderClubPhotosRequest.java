package com.duing.domain.club.controller.dto.request;

import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand;
import com.duing.domain.club.photo.service.dto.command.ReorderClubPhotosCommand.PhotoOrder;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

public record ReorderClubPhotosRequest(
        // 사진 수 상한이 생기면 같은 값으로 맞춘다 — 정렬은 전체 집합을 요구하므로 이 값보다 사진이 많으면 정렬이 막힌다.
        @NotEmpty(message = "정렬할 사진이 비어 있습니다.")
        @Size(max = 500, message = "정렬 목록은 500개 이하여야 합니다.")
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
