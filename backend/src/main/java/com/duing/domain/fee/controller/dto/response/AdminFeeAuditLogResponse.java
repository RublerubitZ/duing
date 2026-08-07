package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.fee.service.dto.query.AdminFeeAuditLogRow;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;

/**
 * 감사 로그 행(스펙 §7.8). {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계)라 system 존으로 환산한다
 * (/TIMEZONE.md 대응표).
 *
 * <p>{@code detail} 은 이벤트 종류마다 키가 다른 변경 스냅샷이라 서버가 형태를 규정하지 않고
 * 저장된 JSONB 원문을 그대로 통과시킨다({@link JsonRawValue}) — 문자열로 감싸 내보내면 화면이
 * 한 번 더 파싱해야 한다. 값이 없는 이벤트(정책 삭제·거래 매칭 등)는 null 이다.
 */
public record AdminFeeAuditLogResponse(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        Instant createdAt,
        String reason,
        Refs refs,
        @JsonRawValue String detail
) {
    /** 이벤트가 가리키는 회비 대상. 종류마다 채워지는 것이 달라 대부분 null 이다. */
    public record Refs(Long feePolicyId, Long feeBillId, Long paymentId, Long bankTransactionId) {
    }

    public static AdminFeeAuditLogResponse from(AdminFeeAuditLogRow logRow) {
        return new AdminFeeAuditLogResponse(
                logRow.eventId(),
                logRow.eventType(),
                logRow.actorUserId(),
                logRow.actorName(),
                TimeMapper.systemWallClockToInstant(logRow.createdAt()),
                logRow.reason(),
                new Refs(logRow.feePolicyId(), logRow.feeBillId(),
                        logRow.paymentId(), logRow.bankTransactionId()),
                logRow.detail());
    }
}
