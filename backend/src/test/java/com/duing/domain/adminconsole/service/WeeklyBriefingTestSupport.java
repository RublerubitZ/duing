package com.duing.domain.adminconsole.service;

import com.duing.global.time.TimeMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.stream.Stream;
import org.springframework.jdbc.core.JdbcTemplate;

/** 주간 브리핑 테스트 공용 — 경계 순간과 regime 별 시각 옮기기. 표·열 이름은 테스트 상수만 넘긴다. */
final class WeeklyBriefingTestSupport {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    private WeeklyBriefingTestSupport() {
    }

    /** 실제 시계 기준 가장 최근에 끝난 주의 월요일 — 날짜가 지나도 허용 범위를 벗어나지 않는다(시한폭탄 없음). */
    static LocalDate latestEndedWeek(Clock clock) {
        return LocalDate.now(clock).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusWeeks(1);
    }

    /** 주 안 경계 두 순간(KST 벽시계) — 월 00:00 정각, 일 23:59:59. */
    static List<LocalDateTime> insideMoments(LocalDate weekStart) {
        return List.of(weekStart.atStartOfDay(), weekStart.plusDays(6).atTime(23, 59, 59));
    }

    /** 주 밖 경계 두 순간(KST 벽시계) — 다음 월 00:00 정각, 전 일요일 23:59:59. */
    static List<LocalDateTime> outsideMoments(LocalDate weekStart) {
        return List.of(weekStart.plusDays(7).atStartOfDay(), weekStart.minusDays(1).atTime(23, 59, 59));
    }

    static List<LocalDateTime> boundaryMoments(LocalDate weekStart) {
        return Stream.concat(insideMoments(weekStart).stream(), outsideMoments(weekStart).stream()).toList();
    }

    /**
     * system regime 열(감사 필드·무클럭 now()) — KST 벽시계를 저장 존 벽시계로 옮겨 넣는다.
     * {@code @CreatedDate} 가 INSERT 때 덮어써 저장 뒤 JDBC 로 옮긴다. timestamptz 열도 같은 값이 같은 순간이 된다.
     */
    static void placeSystem(JdbcTemplate jdbcTemplate, String table, Long id, String column, LocalDateTime kstWallClock) {
        jdbcTemplate.update("UPDATE " + table + " SET " + column + " = ? WHERE id = ?",
                Timestamp.valueOf(TimeMapper.seoulToSystemWallClock(kstWallClock)), id);
    }

    /** seoul regime 열(now(seoulClock) 으로 기록) — KST 벽시계 그대로. */
    static void placeSeoul(JdbcTemplate jdbcTemplate, String table, Long id, String column, LocalDateTime kstWallClock) {
        jdbcTemplate.update("UPDATE " + table + " SET " + column + " = ? WHERE id = ?", Timestamp.valueOf(kstWallClock), id);
    }

    /** Instant 로 기록하는 열 — KST 벽시계를 절대 시각으로. */
    static void placeInstant(JdbcTemplate jdbcTemplate, String table, Long id, String column, LocalDateTime kstWallClock) {
        jdbcTemplate.update("UPDATE " + table + " SET " + column + " = ? WHERE id = ?",
                Timestamp.from(kstWallClock.atZone(SEOUL).toInstant()), id);
    }
}
