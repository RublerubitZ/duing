package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationFaq;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationFaqRepository extends JpaRepository<FederationFaq, Long>, FederationFaqRepositoryCustom {

    // 신규 FAQ는 맨 뒤 배치 — soft delete 제외 최대 정렬값
    @Query("select coalesce(max(faq.sortOrder), -1) from FederationFaq faq where faq.deletedAt is null")
    int findMaxSortOrder();

    // 카테고리 삭제 시 FAQ 존재 여부 검사 — 파생 쿼리라도 @SQLRestriction(deleted_at is null)이 적용되어
    // 삭제된 FAQ는 자동으로 제외된다.
    boolean existsByCategoryId(Long categoryId);

    // 카테고리 삭제(이관) 시 일괄 이관 — RecruitmentRepository.softDeleteByIds 전례의 JPQL 벌크 UPDATE.
    // (a) "JPQL 벌크 UPDATE 금지" 규칙은 낙관락(@Version)을 우회하는 FederationInquiry 한정이다.
    //     FederationFaq는 @Version이 없어 해당 규칙이 적용되지 않는다.
    // (b) soft-deleted FAQ(deletedAt is null 조건으로 제외)는 이관하지 않는다 — 비노출 행이고, 삭제된 카테고리를
    //     참조해도 이름 해석(categoryNameMap)이 null을 허용하므로 안전하다.
    // (c) flushAutomatically로 직전 변경(잠금 조회 등)을 먼저 반영하고, clearAutomatically로 벌크 UPDATE 이후
    //     영속성 컨텍스트에 남을 수 있는 stale FederationFaq 엔티티를 비운다.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update FederationFaq f set f.categoryId = :targetCategoryId "
            + "where f.categoryId = :sourceCategoryId and f.deletedAt is null")
    void reassignCategory(@Param("sourceCategoryId") Long sourceCategoryId,
                           @Param("targetCategoryId") Long targetCategoryId);
}
