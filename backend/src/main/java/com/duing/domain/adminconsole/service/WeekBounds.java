package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.exception.AdminConsoleException;
import com.duing.global.time.TimeMapper;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;

/**
 * 총동연 주간 브리핑의 한 주(KST 월 00:00 ~ 다음 월 00:00) — 같은 두 순간을 열의 저장 regime 마다 그 축의 값으로 적는다(TIMEZONE.md).
 *
 * <ul>
 *   <li>seoul — KST 벽시계. now(seoulClock) 으로 기록하는 열(facility_booking.decided_at)</li>
 *   <li>system — seoul 두 값을 저장 존(JVM 기본 존) 벽시계로 옮긴 값. 감사 필드·무클럭 now() 로 기록하는 열</li>
 *   <li>instant — 절대 시각. Instant 로 기록하는 열(payment.voided_at·profile_check_confirmation.confirmed_at)</li>
 *   <li>date — firstDay ≤ d ≤ lastDay. 날짜 열(admin_pending_snapshot.snapshot_date·recruitment.end_date)</li>
 * </ul>
 * 시각 축은 from 포함·to 제외(반열린 구간)다. 허용 범위는 이번 주 월요일 M(서버 seoulClock) 기준이고 프론트 주 넘기기와 같은 식이다.
 */
public record WeekBounds(
        LocalDate firstDay,
        LocalDate lastDay,
        LocalDateTime seoulFrom,
        LocalDateTime seoulTo,
        LocalDateTime systemFrom,
        LocalDateTime systemTo,
        Instant instantFrom,
        Instant instantTo
) {

    /** 돌아볼 수 있는 가장 이른 주 — 이번 주 월요일에서 52주 전. */
    public static final int HISTORY_WEEKS = 52;

    private static final int DAYS_IN_WEEK = 7;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    /** 끝난 주만(M − 52·7 ≤ W ≤ M − 7) — 주간 지표는 진행 중인 주를 세지 않는다. */
    public static WeekBounds endedWeek(LocalDate weekStart, Clock clock) {
        LocalDate currentMonday = currentMonday(clock);
        requireMonday(weekStart);
        if (weekStart.isAfter(currentMonday)) {
            throw new AdminConsoleException.WeekInFutureException();
        }
        if (weekStart.isEqual(currentMonday)) {
            throw new AdminConsoleException.WeekNotEndedException();
        }
        requireWithinHistory(weekStart, currentMonday);
        return of(weekStart);
    }

    /** 끝난 주와 진행 중인 이번 주(M − 52·7 ≤ W ≤ M) — 시설 히트맵은 '이번 주 챙길 것' 표에도 쓴다. */
    public static WeekBounds startedWeek(LocalDate weekStart, Clock clock) {
        LocalDate currentMonday = currentMonday(clock);
        requireMonday(weekStart);
        if (weekStart.isAfter(currentMonday)) {
            throw new AdminConsoleException.WeekInFutureException();
        }
        requireWithinHistory(weekStart, currentMonday);
        return of(weekStart);
    }

    /** 서버가 정한 이번 주(seoulClock 의 KST 날짜가 든 주) — 프론트는 이 주를 '이번 주 챙길 것'의 기준으로 쓴다(기기 시계 대신). */
    public static WeekBounds currentWeek(Clock clock) {
        return of(currentMonday(clock));
    }

    static WeekBounds of(LocalDate weekStart) {
        LocalDate nextMonday = weekStart.plusDays(DAYS_IN_WEEK);
        LocalDateTime seoulFrom = weekStart.atStartOfDay();
        LocalDateTime seoulTo = nextMonday.atStartOfDay();
        return new WeekBounds(
                weekStart,
                nextMonday.minusDays(1),
                seoulFrom,
                seoulTo,
                TimeMapper.seoulToSystemWallClock(seoulFrom),
                TimeMapper.seoulToSystemWallClock(seoulTo),
                weekStart.atStartOfDay(SEOUL).toInstant(),
                nextMonday.atStartOfDay(SEOUL).toInstant());
    }

    private static LocalDate currentMonday(Clock clock) {
        // clock 은 seoulClock 이라 JVM 기본 존과 무관하게 KST 날짜다.
        return LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private static void requireMonday(LocalDate weekStart) {
        if (weekStart.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw new AdminConsoleException.WeekNotMondayException();
        }
    }

    private static void requireWithinHistory(LocalDate weekStart, LocalDate currentMonday) {
        if (weekStart.isBefore(currentMonday.minusWeeks(HISTORY_WEEKS))) {
            throw new AdminConsoleException.WeekTooOldException();
        }
    }
}
