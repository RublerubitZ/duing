package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinCode;
import java.time.LocalDateTime;

/**
 * 활성 가입 링크 카드용 조회 결과.
 *
 * <p>{@code joinExpiresAt} 은 모집이 종료된 뒤에만 정해지므로(실제 종료 시각 + 프리셋) 진행 중에는
 * null 이다 — 화면은 null 이면 "모집 종료 후 N일까지", 값이 있으면 구체 일시를 보여준다(스펙 v2 4.3).
 * 귀속 모집이 LAZY 라 트랜잭션 안에서 변환해야 한다.
 */
public record JoinCodeQuery(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        int joinWindowDays,
        LocalDateTime joinExpiresAt
) {
    public static JoinCodeQuery from(ClubJoinCode joinCode) {
        return new JoinCodeQuery(
                joinCode.getId(),
                joinCode.getCode(),
                joinCode.getGeneration(),
                joinCode.getMaxUses(),
                joinCode.getUsedCount(),
                joinCode.getJoinWindowDays(),
                joinCode.getJoinExpiresAt()
        );
    }
}
