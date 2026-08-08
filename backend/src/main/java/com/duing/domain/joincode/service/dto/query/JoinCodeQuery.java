package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.ClubJoinCode;
import com.duing.domain.joincode.entity.JoinCodeLinkType;
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
 *
 * <p>{@code linkType}·{@code inviteExpiresAt}·{@code autoApprove} 는 링크 2종(V107)을 함께
 * 표현하기 위한 필드다. 모집 링크는 {@code RECRUITMENT}·만료 null·자동 승인 false 로 내려가므로
 * 기존 화면 의미는 그대로다. {@code joinExpiresAt} 은 두 형태의 사용 기한 단일 출처로 남는다
 * (초대 링크에서는 절대 만료 시각이 그대로 실린다).
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
        long pendingCount,
        JoinCodeLinkType linkType,
        LocalDateTime inviteExpiresAt,
        boolean autoApprove
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
                pendingCount,
                joinCode.isClubInvite() ? JoinCodeLinkType.CLUB_INVITE : JoinCodeLinkType.RECRUITMENT,
                joinCode.getInviteExpiresAt(),
                joinCode.isAutoApprove()
        );
    }
}
