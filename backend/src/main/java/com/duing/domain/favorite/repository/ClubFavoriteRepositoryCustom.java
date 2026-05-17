package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubFavoriteRepositoryCustom {
    Page<FavoriteClubQuery> findFavoriteClubPage(Long userId, Pageable pageable);
}