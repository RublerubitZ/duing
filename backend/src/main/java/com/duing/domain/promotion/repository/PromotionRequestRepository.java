package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PromotionRequestRepository
        extends JpaRepository<PromotionRequest, Long>, PromotionRequestRepositoryCustom {

    Optional<PromotionRequest> findByClubIdAndStatus(Long clubId, PromotionRequestStatus status);

    List<PromotionRequest> findAllByClubIdAndStatus(Long clubId, PromotionRequestStatus status);

    Optional<PromotionRequest> findFirstByClubIdOrderByIdDesc(Long clubId);

    // 관리자 콘솔 미처리 건수 — derived query 라 @SQLRestriction(soft delete 제외) 이 자동 적용된다.
    long countByStatus(PromotionRequestStatus status);

    /** 처리 대기 추이 — 최근 접수(감사 created_at, system regime). */
    long countByCreatedAtGreaterThanEqual(LocalDateTime since);

    /** 처리 대기 추이 — 최근 처리(수락·반려 handled_at, 무클럭 now() = system regime). 동아리 폐쇄 반려도 여기 든다. */
    long countByHandledAtGreaterThanEqual(LocalDateTime since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PromotionRequest r WHERE r.id = :id")
    Optional<PromotionRequest> findByIdForUpdate(@Param("id") Long id);
}
