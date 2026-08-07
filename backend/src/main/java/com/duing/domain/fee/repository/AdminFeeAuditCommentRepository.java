package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.AdminFeeAuditComment;
import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * 감사 의견·메모(V106). soft delete 라 모든 조회에 {@code @SQLRestriction(deleted_at IS NULL)} 이 자동 적용된다.
 * 최신순 동률(같은 트랜잭션 저장)에서 순서가 흔들리지 않도록 id 로 한 번 더 고정한다.
 */
public interface AdminFeeAuditCommentRepository extends JpaRepository<AdminFeeAuditComment, Long> {

    List<AdminFeeAuditComment> findByClubIdOrderByCreatedAtDescIdDesc(Long clubId);

    List<AdminFeeAuditComment> findByClubIdAndKindOrderByCreatedAtDescIdDesc(Long clubId,
                                                                             FeeAuditCommentKind kind);

    /** 수정·삭제 경로의 IDOR 가드 — 경로의 clubId 와 대조해 남의 동아리 의견에는 닿지 않는다(스펙 §7.11). */
    Optional<AdminFeeAuditComment> findByIdAndClubId(Long id, Long clubId);

    /** 대시보드 openOpinionCount — 상태는 의견에만 있어 kind 조건 없이도 의견만 세어진다. */
    long countByStatus(FeeAuditCommentStatus status);

    /**
     * 대시보드 recentActivity.newOpinionCount. {@code since} 는 created_at 과 같은 JVM 존 벽시계여야 한다
     * — created_at 은 JPA 감사 필드다(/TIMEZONE.md).
     */
    long countByKindAndCreatedAtGreaterThanEqual(FeeAuditCommentKind kind, LocalDateTime since);
}
