package com.duing.domain.favorite.service;

import com.duing.domain.favorite.service.dto.query.FavoriteClubQuery;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubFavoriteService {

    Long add(Long userId, Long clubId);

    void remove(Long userId, Long clubId);

    Page<FavoriteClubQuery> getMyFavorites(Long userId, Pageable pageable);

    List<Long> getMyFavoriteClubIds(Long userId);
}