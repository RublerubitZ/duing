package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.JoinCodeLinkType;
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
 *
 * <p>{@code totalRequestCount}(누적 가입 신청, 전 상태)·{@code pendingCount}(승인 대기)는 상태 카드
 * (스펙 v2 7.2)가 그대로 표시하는 수치다. 방금 발급된 링크는 둘 다 0 이다.
 *
 * <p>부원 초대 링크(V107)도 같은 응답을 쓴다: {@code linkType} 으로 형태를 가르고,
 * {@code inviteExpiresAt}(초대 링크만)·{@code autoApprove} 가 더 실린다. 모집 링크의 기존 필드
 * 의미는 그대로이며 추가 필드만 늘어난다. 초대 링크의 사용 기한은 {@code joinExpiresAt} 에도 같은
 * 값이 실려 화면이 한 필드만 보고도 만료를 표시할 수 있다.
 */
public record JoinCodeResponse(
        Long joinCodeId,
        String code,
        Integer generation,
        int maxUses,
        int usedCount,
        int joinWindowDays,
        Instant joinExpiresAt,
        long totalRequestCount,
        long pendingCount,
        JoinCodeLinkType linkType,
        Instant inviteExpiresAt,
        boolean autoApprove
) {
    public static JoinCodeResponse from(JoinCodeQuery joinCodeQuery) {
        return new JoinCodeResponse(
                joinCodeQuery.joinCodeId(),
                joinCodeQuery.code(),
                joinCodeQuery.generation(),
                joinCodeQuery.maxUses(),
                joinCodeQuery.usedCount(),
                joinCodeQuery.joinWindowDays(),
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.joinExpiresAt()),
                joinCodeQuery.totalRequestCount(),
                joinCodeQuery.pendingCount(),
                joinCodeQuery.linkType(),
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.inviteExpiresAt()),
                joinCodeQuery.autoApprove()
        );
    }
}
