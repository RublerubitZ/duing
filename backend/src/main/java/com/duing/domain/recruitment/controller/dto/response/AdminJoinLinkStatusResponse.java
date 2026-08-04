package com.duing.domain.recruitment.controller.dto.response;

import com.duing.domain.joincode.service.dto.query.JoinCodeQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 총동연 상세의 가입 링크 현황(읽기 전용).
 *
 * <p>6자리 코드 값은 담지 않는다 — 관리자 화면은 코드를 쓸 일이 없고, 노출은 유출 경로만 늘린다.
 *
 * <p>{@code enrolledCount} 는 활성 코드 기준 누적 승인 수다. 코드를 재생성하면 새 코드 기준으로
 * 리셋되고(구 코드 등록분 미포함), 승인 후 탈퇴·제명은 반영하지 않는다.
 */
public record AdminJoinLinkStatusResponse(
        String linkStatus,
        Integer generation,
        int maxUses,
        int usedCount,
        long totalRequestCount,
        long pendingCount,
        long enrolledCount,
        int joinWindowDays,
        Instant joinExpiresAt
) {
    public static AdminJoinLinkStatusResponse from(JoinCodeQuery joinCodeQuery, String linkStatus) {
        return new AdminJoinLinkStatusResponse(
                linkStatus,
                joinCodeQuery.generation(),
                joinCodeQuery.maxUses(),
                joinCodeQuery.usedCount(),
                joinCodeQuery.totalRequestCount(),
                joinCodeQuery.pendingCount(),
                // 차감·환급 불변식상 "자리를 쓴 채 남은 요청" = 승인된 요청이다. 화면이 계산하지 않도록
                // 서버가 값을 내려보낸다.
                joinCodeQuery.usedCount() - joinCodeQuery.pendingCount(),
                joinCodeQuery.joinWindowDays(),
                // 기한은 모집 종료 시각(seoulClock 기록)에서 파생되므로 KST 벽시계로 환산한다(TIMEZONE.md).
                TimeMapper.seoulWallClockToInstant(joinCodeQuery.joinExpiresAt())
        );
    }
}
