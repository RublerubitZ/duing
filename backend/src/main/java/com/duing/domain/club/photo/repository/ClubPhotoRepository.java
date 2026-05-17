package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);

    List<ClubPhoto> findByClubId(Long clubId);

    // JPQL 은 @SQLRestriction 을 자동 적용하지 않아 soft-delete 된 행이 포함될 수 있으므로
    // deletedAt IS NULL 조건을 명시한다.
    @Query("SELECT COALESCE(MAX(p.displayOrder), -1) FROM ClubPhoto p "
            + "WHERE p.club.id = :clubId AND p.deletedAt IS NULL")
    int findMaxDisplayOrderByClubId(@Param("clubId") Long clubId);
}
