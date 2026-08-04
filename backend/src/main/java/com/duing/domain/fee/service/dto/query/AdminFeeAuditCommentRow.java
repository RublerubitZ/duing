package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import java.time.LocalDateTime;

/**
 * 감사 의견·메모 한 줄(스펙 §7.10). 시각은 JPA 감사 필드(JVM 존 벽시계)라 응답 경계에서 Instant 로 환산한다.
 * 작성자가 탈퇴하면 {@code authorName} 만 비고 행은 남는다.
 */
public record AdminFeeAuditCommentRow(
        Long commentId, FeeAuditCommentKind kind, FeeAuditCommentStatus status, String content,
        String authorName, LocalDateTime createdAt, LocalDateTime updatedAt
) {
}
