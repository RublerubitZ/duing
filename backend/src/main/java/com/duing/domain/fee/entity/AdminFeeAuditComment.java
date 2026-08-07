package com.duing.domain.fee.entity;

import com.duing.domain.fee.exception.FeeAuditCommentException;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.SQLDelete;
import org.hibernate.annotations.SQLRestriction;

/**
 * 총동연 감사 의견·운영 메모(V106, 스펙 §3.2). ADMIN 전용 데이터라 동아리 측에는 어떤 API 로도 나가지 않는다.
 *
 * <p>감사 로그({@code ClubAuditEvent})와 달리 감사 <b>산출물</b>이라 append-only 가 아니다 —
 * 수정·삭제(soft delete)를 허용한다(스펙 §15 결정 3).
 */
@Getter
@Entity
@Table(name = "admin_fee_audit_comment")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@SQLDelete(sql = "UPDATE admin_fee_audit_comment SET deleted_at = NOW() WHERE id = ?")
@SQLRestriction("deleted_at IS NULL")
public class AdminFeeAuditComment extends BaseEntity {

    @Column(name = "club_id", nullable = false)
    private Long clubId;

    /** 작성한 총동연 계정 — 이름은 조회 시점에 조인해 해석한다(감사 로그와 같은 방식). */
    @Column(name = "author_user_id", nullable = false)
    private Long authorUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private FeeAuditCommentKind kind;

    /** 의견에만 있는 처리 상태 — 메모는 항상 null 이다(DB CHECK 와 같은 규칙). */
    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private FeeAuditCommentStatus status;

    @Column(nullable = false, length = 2000)
    private String content;

    private AdminFeeAuditComment(Long clubId, Long authorUserId, FeeAuditCommentKind kind,
                                 FeeAuditCommentStatus status, String content) {
        this.clubId = clubId;
        this.authorUserId = authorUserId;
        this.kind = kind;
        this.status = status;
        this.content = content;
    }

    /**
     * 생성. 의견은 status 생략 시 {@code OPEN} 을 자동 부여하고(스펙 §15 결정 16),
     * 메모에 status 를 실어 보내면 거부한다 — DB CHECK 와 같은 규칙을 도메인에서도 지킨다.
     */
    public static AdminFeeAuditComment create(Long clubId, Long authorUserId, FeeAuditCommentKind kind,
                                              FeeAuditCommentStatus status, String content) {
        if (kind == FeeAuditCommentKind.OPERATION_MEMO && status != null) {
            throw new FeeAuditCommentException.StatusNotAllowedException();
        }
        FeeAuditCommentStatus initialStatus = kind == FeeAuditCommentKind.AUDIT_OPINION
                ? (status == null ? FeeAuditCommentStatus.OPEN : status)
                : null;
        return new AdminFeeAuditComment(clubId, authorUserId, kind, initialStatus, content);
    }

    /** 내용·상태 부분 수정(둘 다 null 이면 변화 없음). 메모는 상태를 가질 수 없다. */
    public void update(String content, FeeAuditCommentStatus status) {
        if (content != null) {
            this.content = content;
        }
        if (status != null) {
            if (this.kind == FeeAuditCommentKind.OPERATION_MEMO) {
                throw new FeeAuditCommentException.StatusNotAllowedException();
            }
            this.status = status;
        }
    }
}
