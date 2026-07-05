package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationInquiryRepository extends JpaRepository<FederationInquiry, Long>, FederationInquiryRepositoryCustom {

    // 도배 가드 (a): 열린 RECEIVED 건수 — derived query 라 @SQLRestriction(soft delete 제외) 자동 적용.
    long countByAuthorIdAndStatus(Long authorId, FederationInquiryStatus status);

    // 도배 가드 (b): 최근 24시간 생성 건수 — '삭제→재작성' 루프 우회를 막기 위해 soft delete 포함이어야
    // 하므로 native. (@SQLRestriction 은 native 에 적용되지 않는다)
    @Query(value = "select count(*) from federation_inquiry "
            + "where author_id = :authorId and created_at >= now() - interval '24 hours'",
            nativeQuery = true)
    long countRecentIncludingDeleted(@Param("authorId") Long authorId);

    // admin 상세의 404/410 분기 — 삭제된 행 존재 여부를 native 로 판별.
    @Query(value = "select exists(select 1 from federation_inquiry where id = :inquiryId and deleted_at is not null)",
            nativeQuery = true)
    boolean existsDeletedById(@Param("inquiryId") Long inquiryId);
}
