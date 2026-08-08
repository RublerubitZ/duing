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
 *
 * <p>{@code autoApproved} 는 자동 승인 부원 초대 링크(V107)로 접수된 요청 표시용 파생 필드다 —
 * 모집 링크 요청은 항상 false 라 기존 화면 의미는 그대로다.
 */
public record JoinRequestSummaryResponse(
        Long joinRequestId,
        String userName,
        String studentId,
        String major,
        String code,
        Integer generation,
        JoinRequestStatus status,
        Instant requestedAt,
        boolean autoApproved
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
                TimeMapper.systemWallClockToInstant(joinRequestSummaryQuery.requestedAt()),
                joinRequestSummaryQuery.autoApproved()
        );
    }
}
