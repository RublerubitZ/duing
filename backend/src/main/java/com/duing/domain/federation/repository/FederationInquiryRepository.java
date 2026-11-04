package com.duing.domain.federation.repository;

import com.duing.domain.federation.entity.FederationInquiry;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import java.time.LocalDateTime;
import java.util.Collection;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FederationInquiryRepository extends JpaRepository<FederationInquiry, Long>, FederationInquiryRepositoryCustom {

    // 도배 가드 (a): 열린 RECEIVED 건수 — derived query 라 @SQLRestriction(soft delete 제외) 자동 적용.
    long countByAuthorIdAndStatus(Long authorId, FederationInquiryStatus status);

    // 관리자 콘솔 미처리 건수 — 미답변은 RECEIVED·IN_PROGRESS 두 상태에 걸쳐 있어 In 으로 받는다.
    long countByStatusIn(Collection<FederationInquiryStatus> statuses);

    /** 처리 대기 추이 — 최근 접수(감사 created_at, system regime). 작성자 삭제(soft-delete) 건은 빠진다. */
    long countByCreatedAtGreaterThanEqual(LocalDateTime since);

    /**
     * 처리 대기 추이 — 최근 처리. 답변 시각, 답변 없이 닫혔으면 닫은 시각(둘 다 무클럭 now() = system regime).
     * 답변 뒤 닫은 건은 답변 시각으로만 센다 — 한 문의를 두 번 처리로 세지 않는다.
     */
    @Query("SELECT COUNT(inquiry) FROM FederationInquiry inquiry WHERE COALESCE(inquiry.answeredAt, inquiry.closedAt) >= :since")
    long countHandledSince(@Param("since") LocalDateTime since);

    /** 주간 브리핑 — 기간 접수(감사 created_at, system regime). 작성자 삭제 건은 빠진다. */
    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(LocalDateTime from, LocalDateTime to);

    /** 주간 브리핑 — 기간 처리. countHandledSince 와 같은 규칙(답변 시각, 답변 없이 닫혔으면 닫은 시각)의 범위판이다. */
    @Query("SELECT COUNT(inquiry) FROM FederationInquiry inquiry "
            + "WHERE COALESCE(inquiry.answeredAt, inquiry.closedAt) >= :from "
            + "AND COALESCE(inquiry.answeredAt, inquiry.closedAt) < :to")
    long countHandledBetween(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    /** 주간 브리핑 — 기간에 나간 답변 수(answered_at, 무클럭 now() = system regime). */
    long countByAnsweredAtGreaterThanEqualAndAnsweredAtLessThan(LocalDateTime from, LocalDateTime to);

    /**
     * 주간 브리핑 — 기간에 나간 답변의 접수부터 답변까지 평균(분). 답변이 없으면 null.
     * 두 열이 같은 regime(감사·무클럭 now())이라 차는 존과 무관하다. 네이티브라 @SQLRestriction 이 붙지 않아 삭제 조건을 직접 건다.
     * Pageable·Sort 를 받지 않는다(NativeQuerySortGuardTest).
     */
    @Query(value = "SELECT CAST(AVG(EXTRACT(EPOCH FROM (answered_at - created_at)) / 60) AS double precision) "
            + "FROM federation_inquiry "
            + "WHERE deleted_at IS NULL AND answered_at >= :from AND answered_at < :to",
            nativeQuery = true)
    Double averageFirstAnswerMinutes(@Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

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

    /**
     * 보관기간(FederationInquiryPurgeJob 의 window)을 넘긴 soft-delete 문의의 title/content/
     * closed_reason 을 placeholder 로 비운다(행 보존 — 감사 이력 유지, users 익명화 전례). 대상이
     * soft-delete 행이라 @SQLRestriction 을 우회하려 nativeQuery 를 쓴다(PiiRetentionJob 전례).
     * 멱등 술어는 세 컬럼 전체를 본다(ApplicationRepository.scrubExpiredApplicationAnswers 의
     * "이미 비운 행 제외" 전례 확장) — content 단독 가드면 사용자가 본문을 우연히 placeholder 문구와
     * 동일하게 쓴 행에서 title/closed_reason 의 PII 가 파기를 영영 비켜간다.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = "UPDATE federation_inquiry SET title = :placeholderTitle, content = :placeholderContent, "
            + "closed_reason = NULL WHERE deleted_at < :cutoff "
            + "AND (content <> :placeholderContent OR title <> :placeholderTitle OR closed_reason IS NOT NULL)",
            nativeQuery = true)
    int scrubExpiredDeletedInquiries(
            @Param("cutoff") LocalDateTime cutoff,
            @Param("placeholderTitle") String placeholderTitle,
            @Param("placeholderContent") String placeholderContent);
}
