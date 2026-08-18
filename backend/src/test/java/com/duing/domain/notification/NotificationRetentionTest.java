package com.duing.domain.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class NotificationRetentionTest {

    @Test
    @DisplayName("노출·파기 경계는 시계의 존(Asia/Seoul)이 아니라 created_at 이 기록되는 JVM 존 벽시계로 계산된다")
    void visibilityFloorUsesSystemZoneWallClock() {
        // seoulClock 과 동일하게 Asia/Seoul 존을 가진 고정 시계를 넘겨도,
        // 경계는 system 존 벽시계 기준이어야 한다 — prod(JVM=UTC)에서 KST 벽시계로 계산하면
        // 경계가 9시간 이르게 잡혀 30일이 아닌 29일 15시간에 숨김/파기된다.
        Instant fixedInstant = Instant.parse("2026-06-15T00:00:00Z");
        Clock seoulFixedClock = Clock.fixed(fixedInstant, ZoneId.of("Asia/Seoul"));

        LocalDateTime visibilityFloor = NotificationRetention.visibilityFloor(seoulFixedClock);

        LocalDateTime expected = LocalDateTime.ofInstant(fixedInstant, ZoneId.systemDefault())
                .minusDays(NotificationRetention.RETENTION_DAYS);
        assertThat(visibilityFloor).isEqualTo(expected);
    }
}
