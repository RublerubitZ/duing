package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaqCategory;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationFaqCategoryRepository extends JpaRepository<FederationFaqCategory, Long> {

    List<FederationFaqCategory> findAllByOrderBySortOrderAscIdAsc();

    boolean existsByName(String name);

    @Query("select coalesce(max(category.sortOrder), -1) from FederationFaqCategory category where category.deletedAt is null")
    int findMaxSortOrder();

    // 카테고리 삭제 경합 잠금(PESSIMISTIC_WRITE) — FeePolicyRepository.findByIdAndClubIdForUpdate 전례.
    // FAQ 생성/수정의 requireCategory와 카테고리 삭제 트랜잭션이 같은 행을 잠가 "존재 검사 통과 → 삭제 커밋 → 고아
    // FAQ 삽입" 레이스를 차단한다. JPQL에 deleted_at is null을 명시한다(암묵 @SQLRestriction 의존 금지 관례).
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from FederationFaqCategory c where c.id = :categoryId and c.deletedAt is null")
    Optional<FederationFaqCategory> findByIdForUpdate(@Param("categoryId") Long categoryId);
}
