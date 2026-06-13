package com.duing.domain.club.repository;

import com.duing.domain.club.entity.RecertificationRequest;
import com.duing.domain.club.entity.RecertificationStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecertificationRequestRepository
        extends JpaRepository<RecertificationRequest, Long>, RecertificationRequestRepositoryCustom {

    Optional<RecertificationRequest> findByRoundIdAndClubIdAndStatus(
            Long roundId, Long clubId, RecertificationStatus status);

    java.util.List<RecertificationRequest> findByClubIdAndStatus(Long clubId, RecertificationStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RecertificationRequest r WHERE r.id = :id")
    Optional<RecertificationRequest> findByIdForUpdate(@Param("id") Long id);
}
