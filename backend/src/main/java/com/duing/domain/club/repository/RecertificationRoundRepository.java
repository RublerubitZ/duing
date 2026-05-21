package com.duing.domain.club.repository;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.dto.query.RoundAdminSearchCondition;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RecertificationRoundRepository extends JpaRepository<RecertificationRound, Long> {

    Optional<RecertificationRound> findByStatus(RoundStatus status);

    Optional<RecertificationRound> findByYearAndStatus(int year, RoundStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RecertificationRound r WHERE r.id = :id")
    Optional<RecertificationRound> findByIdForUpdate(@Param("id") Long id);

    default Page<RecertificationRound> searchForAdmin(RoundAdminSearchCondition condition, Pageable pageable) {
        if (condition.status() == null) {
            return findAllByOrderByYearDescCreatedAtDesc(pageable);
        }
        return findAllByStatusOrderByYearDescCreatedAtDesc(condition.status(), pageable);
    }

    Page<RecertificationRound> findAllByOrderByYearDescCreatedAtDesc(Pageable pageable);

    Page<RecertificationRound> findAllByStatusOrderByYearDescCreatedAtDesc(
            RoundStatus status, Pageable pageable);
}
