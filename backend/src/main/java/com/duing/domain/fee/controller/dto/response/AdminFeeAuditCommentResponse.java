package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.FeeAuditCommentStatus;
import com.duing.domain.fee.service.dto.query.AdminFeeAuditCommentRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 감사 의견·운영 메모 한 줄(스펙 §7.10). 메모의 {@code status} 는 항상 null 이고,
 * 시각은 JPA 감사 필드(JVM 존 벽시계)라 system 존으로 환산한다(/TIMEZONE.md 대응표).
 */
public record AdminFeeAuditCommentResponse(
        Long commentId,
        FeeAuditCommentKind kind,
        FeeAuditCommentStatus status,
        String content,
        String authorName,
        Instant createdAt,
        Instant updatedAt
) {
    public static AdminFeeAuditCommentResponse from(AdminFeeAuditCommentRow commentRow) {
        return new AdminFeeAuditCommentResponse(
                commentRow.commentId(),
                commentRow.kind(),
                commentRow.status(),
                commentRow.content(),
                commentRow.authorName(),
                TimeMapper.systemWallClockToInstant(commentRow.createdAt()),
                TimeMapper.systemWallClockToInstant(commentRow.updatedAt()));
    }
}
