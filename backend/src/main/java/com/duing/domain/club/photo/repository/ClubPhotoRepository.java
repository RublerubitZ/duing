package com.duing.domain.club.photo.repository;

import com.duing.domain.club.photo.entity.ClubPhoto;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ClubPhotoRepository extends JpaRepository<ClubPhoto, Long> {

    List<ClubPhoto> findByClubIdOrderByDisplayOrderAsc(Long clubId);
}
