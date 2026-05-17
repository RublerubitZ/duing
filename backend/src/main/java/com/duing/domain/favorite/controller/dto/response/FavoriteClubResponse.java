package com.duing.domain.favorite.controller.dto.response;

import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import java.time.LocalDateTime;

public record FavoriteClubResponse(
        Long clubId,
        String name,
        String logoUrl,
        ClubCategory category,
        String division,
        LocalDateTime favoritedAt,
        int openRecruitmentCount
) {
    public static FavoriteClubResponse from(FavoriteClubQuery query) {
        return new FavoriteClubResponse(
                query.clubId(),
                query.name(),
                query.logoUrl(),
                query.category(),
                query.division(),
                query.favoritedAt(),
                query.openRecruitmentCount()
        );
    }
}