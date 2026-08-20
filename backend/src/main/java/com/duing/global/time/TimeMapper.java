package com.duing.global.time;

import java.time.Clock;
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

    /**
     * 저장 존(JVM 기본 존) 기준의 현재 벽시계. {@code clock} 에서는 "지금"이라는 순간만 쓰고 존은 무시한다.
     *
     * <p>system regime 값(JPA 감사 필드·무클럭 {@code LocalDateTime.now()} 저장 값)과 비교·연산할 경계를
     * 만들 때 쓴다. 유일한 Clock 빈이 seoulClock 이라 <b>{@code LocalDateTime.now(clock)} 의 벽시계를 그대로
     * 쓰면 prod(JVM=UTC)에서 9시간 어긋난다</b> — 보존 경계·조회 윈도우가 그만큼 이르게 잡힌다.
     */
    public static LocalDateTime systemNow(Clock clock) {
        return LocalDateTime.ofInstant(clock.instant(), ZoneId.systemDefault());
    }

    /**
     * KST 벽시계를 같은 절대시각의 저장 존(JVM 기본 존) 벽시계로 옮긴다.
     *
     * <p>"오늘"·"이번 기간" 같은 KST 기준 경계로 system regime 컬럼을 조회할 때 쓴다.
     * <b>KST 벽시계를 그대로 쓰면 prod(JVM=UTC)에서 9시간 어긋나</b> 자정~오전 09시 구간의 행이
     * 하루 밀려 집계된다.
     */
    public static LocalDateTime seoulToSystemWallClock(LocalDateTime seoulWallClock) {
        return seoulWallClock == null ? null
                : seoulWallClock.atZone(SEOUL).withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime();
    }
}
