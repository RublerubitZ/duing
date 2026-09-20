package com.duing.global.monitoring.event;

import java.time.LocalDateTime;

/**
 * 운영진이 자동승인 부원 초대 링크를 발급했다 — 승인 없이 부원이 되는 경로라 총동연 채널에 신호를 남긴다.
 * 승인제 초대는 발행하지 않는다. 코드 값은 싣지 않는다. {@code expiresAtKst} 는 seoulClock 벽시계 그대로다.
 */
public record ClubInviteAutoApproveIssuedEvent(
        Long clubId, String clubName, Long joinCodeId, int maxUses, LocalDateTime expiresAtKst, Long actorUserId) {
}
