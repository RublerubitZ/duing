package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.photo.entity.ClubPhoto;

public record ClubPhotoQuery(
        Long id,
        String storageKey,
        String caption,
        Integer width,
        Integer height,
        int displayOrder
) {
    public static ClubPhotoQuery from(ClubPhoto photo) {
        return new ClubPhotoQuery(
                photo.getId(),
                photo.getStorageKey(),
                photo.getCaption(),
                photo.getWidth(),
                photo.getHeight(),
                photo.getDisplayOrder()
        );
    }
}
