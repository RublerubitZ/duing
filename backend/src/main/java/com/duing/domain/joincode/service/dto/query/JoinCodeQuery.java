package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinCode;
import java.time.LocalDateTime;

/**
 * 활성 가입 링크 카드용 조회 결과.
 *
 * <p>{@code joinExpiresAt} 은 모집이 종료된 뒤에만 정해지므로(실제 종료 시각 + 프리셋) 진행 중에는
 * null 이다 — 화면은 null 이면 "모집 종료 후 N일까지", 값이 있으면 구체 일시를 보여준다(스펙 v2 4.3).
 * 귀속 모집이 LAZY 라 트랜잭션 안에서 변환해야 한다.
 *
 * <p>{@code totalRequestCount}·{@code pendingCount} 는 상태 카드(스펙 v2 7.2)가 쓰는 수치다.
 * 누적은 거절 후 재요청까지 포함한 전 상태이며, 두 값 모두 서버가 계산해 내려보낸다 — 화면이
 * 목록을 합산하면 상태 필터에 따라 수치가 달라진다.
 */
public record JoinCodeQuery(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        int joinWindowDays,
        LocalDateTime joinExpiresAt,
        long totalRequestCount,
        long pendingCount
) {
    public static JoinCodeQuery from(ClubJoinCode joinCode, long totalRequestCount, long pendingCount) {
        return new JoinCodeQuery(
                joinCode.getId(),
                joinCode.getCode(),
                joinCode.getGeneration(),
                joinCode.getMaxUses(),
                joinCode.getUsedCount(),
                joinCode.getJoinWindowDays(),
                joinCode.getJoinExpiresAt(),
                totalRequestCount,
                pendingCount
        );
    }
}
