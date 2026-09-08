package com.duing.domain.clubaudit.service.dto.query;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import java.time.LocalDateTime;

/**
 * 활동 이력 행(활동 이력 스펙 §2.3). {@code actorName} 은 조회 시점 조인이라 탈퇴 회원이면 null,
 * {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계) 원본 — 절대시각 환산은 응답 경계가 한다.
 * {@code recruitmentId} 가 null 인 가입 링크 이벤트가 부원 초대다. {@code detail} 은 JSONB 원문 그대로다.
 */
public record AdminClubActivityEventRow(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        LocalDateTime createdAt,
        String reason,
        Long recruitmentId,
        Long joinCodeId,
        String detail
) {
}
