package com.duing.domain.clubaudit.controller.dto.response;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.clubaudit.service.dto.query.AdminClubActivityEventRow;
import com.duing.global.time.TimeMapper;
import com.fasterxml.jackson.annotation.JsonRawValue;
import java.time.Instant;

/**
 * 활동 이력 행. {@code createdAt} 은 JPA 감사 필드(JVM 존 벽시계)라 system 존으로 환산한다(/TIMEZONE.md).
 * {@code detail} 은 이벤트 종류마다 키가 다른 스냅샷이라 저장된 JSONB 원문을 그대로 통과시킨다({@link JsonRawValue}).
 * {@code recruitmentId} 가 null 인 가입 링크 이벤트가 부원 초대 링크다.
 */
public record AdminClubActivityEventResponse(
        Long eventId,
        ClubAuditEventType eventType,
        Long actorUserId,
        String actorName,
        Instant createdAt,
        String reason,
        Long recruitmentId,
        Long joinCodeId,
        @JsonRawValue String detail
) {
    public static AdminClubActivityEventResponse from(AdminClubActivityEventRow row) {
        return new AdminClubActivityEventResponse(
                row.eventId(),
                row.eventType(),
                row.actorUserId(),
                row.actorName(),
                TimeMapper.systemWallClockToInstant(row.createdAt()),
                row.reason(),
                row.recruitmentId(),
                row.joinCodeId(),
                row.detail());
    }
}
