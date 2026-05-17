package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);

    List<ClubPhoto> findByClubId(Long clubId);

    @Query("SELECT COALESCE(MAX(p.displayOrder), -1) FROM ClubPhoto p WHERE p.club.id = :clubId")
    int findMaxDisplayOrderByClubId(@Param("clubId") Long clubId);
}
