package com.duing.domain.favorite.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import java.time.LocalDateTime;

public record FavoriteClubQuery(
        Long clubId,
        String name,
        String logoUrl,
        ClubCategory category,
        String division,
        LocalDateTime favoritedAt,
        int openRecruitmentCount
) {}