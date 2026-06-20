package com.duing.domain.notification;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 알림 보존정책. 생성 후 {@link #RETENTION_DAYS}일까지만 노출하고, 그 이후 개인 알림(notification)은
 * 보존 잡이 물리 삭제한다. 공지(broadcast)는 notice 도메인과 공유되는 데이터라 삭제하지 않고 노출만 제한한다.
 */
public final class NotificationRetention {

    public static final int RETENTION_DAYS = 30;

    /** 도메인 시계 기준 — 파기 잡의 Clock(Asia/Seoul)과 동일 타임존으로 맞춰 노출/삭제 경계를 일치시킨다. */
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

    private NotificationRetention() {
    }

    /** 노출 하한 시각(now - RETENTION_DAYS). 이 시각 이후 생성된 알림만 노출한다. */
    public static LocalDateTime visibilityFloor() {
        return LocalDateTime.now(ZONE).minusDays(RETENTION_DAYS);
    }
}
