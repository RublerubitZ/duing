package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.entity.ClubFavorite;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubFavoriteRepository
        extends JpaRepository<ClubFavorite, Long>, ClubFavoriteRepositoryCustom {

    boolean existsByUserIdAndClubId(Long userId, Long clubId);

    Optional<ClubFavorite> findByUserIdAndClubId(Long userId, Long clubId);

    List<ClubFavorite> findAllByUserIdOrderByCreatedAtDesc(Long userId);
}