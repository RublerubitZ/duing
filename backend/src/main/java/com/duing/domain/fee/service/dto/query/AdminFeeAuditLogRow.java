package com.duing.domain.fee.service.dto.query;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import java.time.LocalDateTime;

/**
 * 감사 로그 행(스펙 §7.8). 참조 4종은 이벤트 종류마다 채워지는 것이 달라 대부분 null 이다.
 *
 * <p>{@code actorName} 은 조회 시점에 사용자 이름을 붙인 값이라 탈퇴 회원이면 null 이고,
 * {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계) 원본 그대로다 — 절대시각 환산은 응답 경계가 한다.
 * {@code detail} 은 저장된 JSONB 원문이라 응답까지 그대로 통과시킨다.
 */
public record AdminFeeAuditLogRow(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        LocalDateTime createdAt,
        String reason,
        Long feePolicyId,
        Long feeBillId,
        Long paymentId,
        Long bankTransactionId,
        String detail
) {
}
