package com.duing.domain.clubmember.repository;

import com.duing.domain.clubmember.entity.LeaderSuccessionRequest;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface LeaderSuccessionRequestRepository
        extends JpaRepository<LeaderSuccessionRequest, Long>, LeaderSuccessionRequestRepositoryCustom {

    Optional<LeaderSuccessionRequest> findByClubIdAndStatus(Long clubId, SuccessionStatus status);

    Optional<LeaderSuccessionRequest> findFirstByClubIdAndRequesterUserIdOrderByIdDesc(
            Long clubId, Long requesterUserId);

    // 관리자 콘솔 미처리 건수 — derived query 라 @SQLRestriction(soft delete 제외) 이 자동 적용된다.
    long countByStatus(SuccessionStatus status);

    /** 처리 대기 추이 — 최근 접수(감사 created_at, system regime). */
    long countByCreatedAtGreaterThanEqual(LocalDateTime since);

    /** 처리 대기 추이 — 최근 처리(승인·반려 handled_at, 무클럭 now() = system regime). 동아리 폐쇄 반려도 여기 든다. */
    long countByHandledAtGreaterThanEqual(LocalDateTime since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM LeaderSuccessionRequest r WHERE r.id = :id")
    Optional<LeaderSuccessionRequest> findByIdForUpdate(@Param("id") Long id);
}
