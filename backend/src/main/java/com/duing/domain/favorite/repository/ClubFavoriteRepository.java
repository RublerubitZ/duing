package com.duing.domain.favorite.repository;

import com.duing.domain.favorite.entity.ClubFavorite;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubFavoriteRepository
        extends JpaRepository<ClubFavorite, Long>, ClubFavoriteRepositoryCustom {

    boolean existsByUserIdAndClubId(Long userId, Long clubId);

    Optional<ClubFavorite> findByUserIdAndClubId(Long userId, Long clubId);

    List<ClubFavorite> findAllByUserIdOrderByCreatedAtDesc(Long userId);

    @Query("select cf.user.id from ClubFavorite cf where cf.club.id = :clubId")
    List<Long> findUserIdsByClubId(@Param("clubId") Long clubId);
}