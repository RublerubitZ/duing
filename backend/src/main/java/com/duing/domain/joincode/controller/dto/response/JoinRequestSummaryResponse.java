package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.dto.query.JoinRequestSummaryQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 운영 콘솔의 가입 요청 목록 항목.
 *
 * <p>전화번호 필드가 없는 것은 의도다 — 개인정보는 상세 조회에서만 노출한다(스펙 5).
 * {@code requestedAt} 은 BaseEntity 감사 필드라 JVM 존 벽시계로 저장되므로 system 변환을 태운다(TIMEZONE.md).
 */
public record JoinRequestSummaryResponse(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String code,
        Integer generation,
        JoinRequestStatus status,
        Instant requestedAt
) {
    public static JoinRequestSummaryResponse from(JoinRequestSummaryQuery joinRequestSummaryQuery) {
        return new JoinRequestSummaryResponse(
                joinRequestSummaryQuery.joinRequestId(),
                joinRequestSummaryQuery.userName(),
                joinRequestSummaryQuery.studentId(),
                joinRequestSummaryQuery.major(),
                joinRequestSummaryQuery.code(),
                joinRequestSummaryQuery.generation(),
                joinRequestSummaryQuery.status(),
                TimeMapper.systemWallClockToInstant(joinRequestSummaryQuery.requestedAt())
        );
    }
}
