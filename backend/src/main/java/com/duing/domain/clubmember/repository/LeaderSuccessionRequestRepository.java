package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeaderSuccessionRequestRepository
        extends JpaRepository<LeaderSuccessionRequest, Long>, LeaderSuccessionRequestRepositoryCustom {

    Optional<LeaderSuccessionRequest> findByClubIdAndStatus(Long clubId, SuccessionStatus status);

    // 관리자 콘솔 미처리 건수 — derived query 라 @SQLRestriction(soft delete 제외) 이 자동 적용된다.
    long countByStatus(SuccessionStatus status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM LeaderSuccessionRequest r WHERE r.id = :id")
    Optional<LeaderSuccessionRequest> findByIdForUpdate(@Param("id") Long id);
}
