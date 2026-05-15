package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.service.dto.query.ClubPhotoQuery;

public record ClubPhotoResponse(
        Long id,
        String storageKey,
        String caption,
        Integer width,
        Integer height,
        int displayOrder
) {
    public static ClubPhotoResponse from(ClubPhotoQuery query) {
        return new ClubPhotoResponse(
                query.id(), query.storageKey(), query.caption(),
                query.width(), query.height(), query.displayOrder()
        );
    }
}
