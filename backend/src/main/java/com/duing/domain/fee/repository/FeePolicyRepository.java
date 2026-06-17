package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeePolicy;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FeePolicyRepository extends JpaRepository<FeePolicy, Long> {
    List<FeePolicy> findAllByClubIdOrderByCreatedAtDesc(Long clubId);
    Optional<FeePolicy> findByIdAndClubId(Long id, Long clubId);

    // 발행/수정/삭제가 같은 정책 행에 대해 직렬화되도록 비관적 쓰기 잠금으로 조회한다(§7 정책 lifecycle 경합).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM FeePolicy p WHERE p.id = :id AND p.clubId = :clubId")
    Optional<FeePolicy> findByIdAndClubIdForUpdate(@Param("id") Long id, @Param("clubId") Long clubId);
}
