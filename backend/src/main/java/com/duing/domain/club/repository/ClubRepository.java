package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.entity.ClubStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ClubRepository extends JpaRepository<Club, Long>, ClubRepositoryCustom {

    boolean existsByName(String name);

    boolean existsByIdAndStatus(Long id, ClubStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT club FROM Club club WHERE club.id = :clubId")
    Optional<Club> findByIdForUpdate(@Param("clubId") Long clubId);
}
