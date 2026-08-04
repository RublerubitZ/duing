package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 모집 관리 화면의 활성 가입 링크 카드 응답.
 *
 * <p>사용 가능 기간은 절대 만료일이 아니라 모집 종료 기준 프리셋이다(스펙 v2 4.3):
 * {@code joinWindowDays} 는 항상 내려가고, {@code joinExpiresAt} 은 모집이 실제로 종료된 뒤에만
 * 값이 생긴다 — 화면은 진행 중이면 "모집 종료 후 N일까지", 종료 뒤에는 구체 일시를 보여준다.
 * 종료 시각은 seoulClock 벽시계로 기록되므로 KST 기준으로 절대시각 변환한다(TIMEZONE.md).
 */
public record JoinCodeResponse(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        int joinWindowDays,
        Instant joinExpiresAt
) {
    public static JoinCodeResponse from(JoinCodeQuery joinCodeQuery) {
        return new JoinCodeResponse(
                joinCodeQuery.joinCodeId(),
                joinCodeQuery.code(),
                joinCodeQuery.generation(),
                joinCodeQuery.maxUses(),
                joinCodeQuery.usedCount(),
                joinCodeQuery.joinWindowDays(),
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.joinExpiresAt())
        );
    }
}
