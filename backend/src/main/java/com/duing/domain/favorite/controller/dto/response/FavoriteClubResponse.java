package com.duing.domain.favorite.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record FavoriteClubResponse(
        Long clubId,
        String name,
        String logoUrl,
        ClubCategory category,
        String division,
        Instant favoritedAt,
        int openRecruitmentCount
) {
    public static FavoriteClubResponse from(FavoriteClubQuery query) {
        return new FavoriteClubResponse(
                query.clubId(),
                query.name(),
                query.logoUrl(),
                query.category(),
                query.division(),
                TimeMapper.systemWallClockToInstant(query.favoritedAt()),
                query.openRecruitmentCount()
        );
    }
}