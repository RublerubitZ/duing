package com.duing.domain.club.heroactivity.service.dto.query;

import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import com.duing.domain.club.photo.entity.ClubPhoto;

public record HeroActivityQuery(
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
    /** clubPhoto 는 LAZY — 트랜잭션 내에서 호출해야 storageKey 등이 초기화된다. */
    public static HeroActivityQuery from(ClubHeroActivity activity) {
        ClubPhoto photo = activity.getClubPhoto();
        return new HeroActivityQuery(
                activity.getId(),
                photo.getId(),
                photo.getStorageKey(),
                photo.getCaption(),
                photo.getWidth(),
                photo.getHeight(),
                activity.getTitle(),
                activity.getDescription(),
                activity.getDisplayOrder()
        );
    }
}
