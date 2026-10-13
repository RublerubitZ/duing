package com.duing.domain.application.service;

import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.LocalDateTime;

/**
 * 오래된 미처리 지원서 기준의 단일 지점 — 미처리 지원서 리마인더 잡과 총동연 콘솔 미처리 배지가 공유한다.
 *
 * <p>미처리 지원서는 SUBMITTED 만이다. 보류(ON_HOLD) 등 한 번이라도 다른 상태로 바뀐 지원서는 운영진이 손댄 것으로 본다.
 * 그중 제출 뒤 {@link #PENDING_DAYS}일이 지난(정확히 그 시각 제출 포함) 것을 오래된 미처리로 본다.
 * 리마인더가 나가는 모집과 배지에 잡히는 모집이 갈리지 않도록 기준을 여기서만 정한다.
 */
public final class PendingApplicationPolicy {

    /** 제출 뒤 이 기간이 지나도록 SUBMITTED 면 오래된 미처리다. */
    public static final int PENDING_DAYS = 7;

    private PendingApplicationPolicy() {
    }

    /**
     * 이 시각 이전(포함)에 제출된 SUBMITTED 지원서가 오래된 미처리다.
     * application.created_at 은 system regime 이라 같은 regime 벽시계로 만든다(TIMEZONE.md).
     */
    public static LocalDateTime submittedBefore(Clock clock) {
        return TimeMapper.systemNow(clock).minusDays(PENDING_DAYS);
    }
}
