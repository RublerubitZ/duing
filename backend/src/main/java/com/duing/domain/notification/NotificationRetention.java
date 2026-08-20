package com.duing.domain.notification;

import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDateTime;

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
     * <p>비교 대상 created_at 은 system regime(TIMEZONE.md)이라 경계도 저장 존에서 계산한다 —
     * 어긋나면 알림이 30일이 아닌 29일 15시간 만에 숨김/파기된다.
     */
    public static LocalDateTime visibilityFloor(Clock clock) {
        return TimeMapper.systemNow(clock).minusDays(RETENTION_DAYS);
    }
}
