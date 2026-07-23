package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.heroactivity.service.dto.query.HeroActivityQuery;

public record HeroActivityResponse(
        Long id,
        Long clubPhotoId,
        String storageKey,
        String caption,
        Integer width,
        Integer height,
        String title,
        String description,
        int displayOrder
) {
    public static HeroActivityResponse from(HeroActivityQuery query) {
        return new HeroActivityResponse(
                query.id(),
                query.clubPhotoId(),
                query.storageKey(),
                query.caption(),
                query.width(),
                query.height(),
                query.title(),
                query.description(),
                query.displayOrder()
        );
    }
}
