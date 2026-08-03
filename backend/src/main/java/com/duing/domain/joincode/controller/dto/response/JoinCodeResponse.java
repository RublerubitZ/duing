package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 운영 콘솔의 활성 가입 코드 카드 응답.
 *
 * <p>{@code recruitmentOpen} 은 귀속 모집이 마감돼 코드가 파생적으로 사용 불가가 된 상태를
 * 콘솔이 "모집 마감으로 사용 불가"로 표시하기 위한 신호다.
 * {@code expiresAt} 은 seoulClock 벽시계로 기록되므로 KST 기준으로 절대시각 변환한다(TIMEZONE.md).
 */
public record JoinCodeResponse(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        Instant expiresAt,
        boolean recruitmentOpen
) {
    public static JoinCodeResponse from(JoinCodeQuery joinCodeQuery) {
        return new JoinCodeResponse(
                joinCodeQuery.joinCodeId(),
                joinCodeQuery.code(),
                joinCodeQuery.generation(),
                joinCodeQuery.maxUses(),
                joinCodeQuery.usedCount(),
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.expiresAt()),
                joinCodeQuery.recruitmentOpen()
        );
    }
}
