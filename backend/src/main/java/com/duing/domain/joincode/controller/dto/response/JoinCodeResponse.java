package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 모집 관리 화면의 활성 가입 코드 카드 응답.
 *
 * <p>코드는 모집에 귀속되고 모집 상태는 사용 가능 여부를 좌우하지 않으므로(스펙 v2 4.2)
 * 모집 상태 신호는 내려보내지 않는다 — 화면은 모집 상세가 이미 아는 상태를 그대로 쓴다.
 * {@code expiresAt} 은 seoulClock 벽시계로 기록되므로 KST 기준으로 절대시각 변환한다(TIMEZONE.md).
 */
public record JoinCodeResponse(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        Instant expiresAt
) {
    public static JoinCodeResponse from(JoinCodeQuery joinCodeQuery) {
        return new JoinCodeResponse(
                joinCodeQuery.joinCodeId(),
                joinCodeQuery.code(),
                joinCodeQuery.generation(),
                joinCodeQuery.maxUses(),
                joinCodeQuery.usedCount(),
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.expiresAt())
        );
    }
}
