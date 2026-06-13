package com.duing.domain.promotion.repository;

import com.duing.domain.promotion.entity.PromotionRequest;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import jakarta.persistence.LockModeType;
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

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM PromotionRequest r WHERE r.id = :id")
    Optional<PromotionRequest> findByIdForUpdate(@Param("id") Long id);
}
