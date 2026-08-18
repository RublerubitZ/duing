package com.duing.domain.notification;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 알림 보존정책. 생성 후 {@link #RETENTION_DAYS}일까지만 노출하고, 그 이후 개인 알림(notification)은
 * 보존 잡이 물리 삭제한다. 공지(broadcast)는 notice 도메인과 공유되는 데이터라 삭제하지 않고 노출만 제한한다.
 */
public final class NotificationRetention {

    public static final int RETENTION_DAYS = 30;

    private NotificationRetention() {
    }

    /**
     * 노출·파기 공용 경계 시각(now - RETENTION_DAYS). 이 시각 이후 생성된 알림만 노출하고,
     * 이전 알림은 파기 잡이 삭제한다 — 노출 쿼리와 파기 잡이 반드시 이 메서드 하나를 공유해
     * "노출은 남았는데 파기됨" 류의 경계 불일치를 막는다.
     *
     * <p>비교 대상 created_at 은 무존 벽시계(system regime — TIMEZONE.md)로 기록되므로 경계도
     * JVM 존 벽시계로 계산한다. seoulClock 벽시계를 그대로 쓰면 prod(UTC)에서 경계가 9시간
     * 이르게 잡혀 알림이 30일이 아닌 29일 15시간 만에 숨김/파기된다.
     */
    public static LocalDateTime visibilityFloor(Clock clock) {
        return LocalDateTime.now(clock.withZone(ZoneId.systemDefault())).minusDays(RETENTION_DAYS);
    }
}
