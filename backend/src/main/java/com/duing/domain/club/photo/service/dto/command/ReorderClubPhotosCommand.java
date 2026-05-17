package com.duing.domain.club.photo.service.dto.command;

import java.util.List;

public record ReorderClubPhotosCommand(
        Long clubId,
        Long requesterId,
        List<PhotoOrder> orders
) {
    public record PhotoOrder(Long photoId, int displayOrder) {}
}
