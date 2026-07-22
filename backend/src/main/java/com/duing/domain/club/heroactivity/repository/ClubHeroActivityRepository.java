package com.duing.domain.club.heroactivity.repository;

import com.duing.domain.club.heroactivity.entity.ClubHeroActivity;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubHeroActivityRepository extends JpaRepository<ClubHeroActivity, Long> {

    List<ClubHeroActivity> findByClubIdOrderByDisplayOrderAsc(Long clubId);

    List<ClubHeroActivity> findByClubId(Long clubId);

    boolean existsByClubIdAndClubPhotoId(Long clubId, Long clubPhotoId);

    boolean existsByClubIdAndDisplayOrder(Long clubId, int displayOrder);

    boolean existsByClubPhotoId(Long clubPhotoId);
}
