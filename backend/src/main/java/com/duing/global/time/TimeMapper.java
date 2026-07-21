package com.duing.global.time;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * 저장된 벽시계(LocalDateTime)를 API 경계에서 절대시각(Instant)으로 환산한다.
 *
 * 어느 존의 벽시계인지는 컬럼 타입이 아니라 "그 필드를 기록한 코드"가 결정한다:
 * - JPA 감사 필드(BaseEntity)·무클럭 LocalDateTime.now() 저장 값 → JVM 기본 존 벽시계 → systemWallClockToInstant
 * - seoulClock(Asia/Seoul)으로 기록한 도메인 필드 → KST 벽시계 → seoulWallClockToInstant
 *
 * 2단계(timestamptz 통일 + 엔티티 Instant 전환) 마이그레이션 완료 시 제거되는 임시 계층이다.
 * 필드별 존 대응표: /TIMEZONE.md
 */
public final class TimeMapper {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private TimeMapper() {
    }

    public static Instant systemWallClockToInstant(LocalDateTime wallClock) {
        return wallClock == null ? null : wallClock.atZone(ZoneId.systemDefault()).toInstant();
    }

    public static Instant seoulWallClockToInstant(LocalDateTime wallClock) {
        return wallClock == null ? null : wallClock.atZone(SEOUL).toInstant();
    }
}
