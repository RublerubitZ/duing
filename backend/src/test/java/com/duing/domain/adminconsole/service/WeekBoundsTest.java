package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.adminconsole.exception.AdminConsoleException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.TimeZone;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 주 경계의 regime 을 고정한다. 9시간 밀림은 JVM 기본 존이 KST 가 아닐 때만 드러나므로 각 테스트가 기본 존을
 * UTC 로 잠시 바꾼다(AdminPendingTrendQueryServiceTest 전례). Clock 은 항상 seoulClock 과 같은 존.
 */
class WeekBoundsTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    /** UTC 2026-11-01 15:30 = KST 2026-11-02(월) 00:30 — UTC 날짜는 아직 일요일인 순간. */
    private static final Clock MONDAY_JUST_AFTER_MIDNIGHT = Clock.fixed(Instant.parse("2026-11-01T15:30:00Z"), SEOUL);
    /** UTC 2026-11-01 14:59 = KST 2026-11-01(일) 23:59 — 10/26 주의 마지막 순간. */
    private static final Clock SUNDAY_JUST_BEFORE_MIDNIGHT = Clock.fixed(Instant.parse("2026-11-01T14:59:00Z"), SEOUL);

    private TimeZone originalDefaultZone;

    @BeforeEach
    void useUtcJvmZone() {
        originalDefaultZone = TimeZone.getDefault();
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }

    @AfterEach
    void restoreDefaultZone() {
        TimeZone.setDefault(originalDefaultZone);
    }

    @Test
    @DisplayName("운영과 같은 UTC JVM 에서도 지난주 경계는 KST 월 00:00 ~ 다음 월 00:00 이다 — 축마다 같은 순간을 그 축의 벽시계로 적는다")
    void boundsKeepKstMidnightOnEachAxisUnderUtcJvm() {
        WeekBounds week = WeekBounds.endedWeek(LocalDate.of(2026, 10, 26), MONDAY_JUST_AFTER_MIDNIGHT);

        assertThat(week.firstDay()).isEqualTo(LocalDate.of(2026, 10, 26));
        assertThat(week.lastDay()).isEqualTo(LocalDate.of(2026, 11, 1));
        assertThat(week.seoulFrom()).isEqualTo(LocalDateTime.of(2026, 10, 26, 0, 0));
        assertThat(week.seoulTo()).isEqualTo(LocalDateTime.of(2026, 11, 2, 0, 0));
        // 저장 존(UTC) 벽시계 — KST 벽시계를 그대로 썼다면 9시간 늦은 경계가 된다.
        assertThat(week.systemFrom()).isEqualTo(LocalDateTime.of(2026, 10, 25, 15, 0));
        assertThat(week.systemTo()).isEqualTo(LocalDateTime.of(2026, 11, 1, 15, 0));
        assertThat(week.instantFrom()).isEqualTo(Instant.parse("2026-10-25T15:00:00Z"));
        assertThat(week.instantTo()).isEqualTo(Instant.parse("2026-11-01T15:00:00Z"));
    }

    @Test
    @DisplayName("이번 주는 KST 날짜로 정한다 — UTC 날짜가 아직 일요일이어도 KST 월요일이 시작된 주는 끝나지 않은 주다")
    void currentWeekFollowsKstDateUnderUtcJvm() {
        assertRejected(LocalDate.of(2026, 11, 2), MONDAY_JUST_AFTER_MIDNIGHT, "WEEK_NOT_ENDED");
        assertThat(WeekBounds.endedWeek(LocalDate.of(2026, 10, 26), MONDAY_JUST_AFTER_MIDNIGHT).firstDay())
                .isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    @DisplayName("KST 일요일 23:59 에는 그 주가 아직 진행 중이라 받지 않고, 한 주 전은 받는다")
    void sundayNightIsStillTheCurrentWeek() {
        assertRejected(LocalDate.of(2026, 10, 26), SUNDAY_JUST_BEFORE_MIDNIGHT, "WEEK_NOT_ENDED");
        assertThat(WeekBounds.endedWeek(LocalDate.of(2026, 10, 19), SUNDAY_JUST_BEFORE_MIDNIGHT).lastDay())
                .isEqualTo(LocalDate.of(2026, 10, 25));
    }

    @Test
    @DisplayName("월요일이 아닌 날·아직 오지 않은 주·52주보다 이른 주는 각자의 코드로 거절한다")
    void rejectsOutOfRangeWeeksWithCodes() {
        assertRejected(LocalDate.of(2026, 10, 27), MONDAY_JUST_AFTER_MIDNIGHT, "WEEK_NOT_MONDAY");
        assertRejected(LocalDate.of(2026, 11, 9), MONDAY_JUST_AFTER_MIDNIGHT, "WEEK_IN_FUTURE");
        // 이번 주 월요일 2026-11-02 에서 53주 전
        assertRejected(LocalDate.of(2025, 10, 27), MONDAY_JUST_AFTER_MIDNIGHT, "WEEK_TOO_OLD");
    }

    @Test
    @DisplayName("가장 이른 주(52주 전)와 가장 최근에 끝난 주는 받는다 — 프론트 주 넘기기 양 끝과 같은 식이다")
    void acceptsBothEndsOfHistory() {
        assertThat(WeekBounds.endedWeek(LocalDate.of(2025, 11, 3), MONDAY_JUST_AFTER_MIDNIGHT).firstDay())
                .isEqualTo(LocalDate.of(2025, 11, 3));
        assertThat(WeekBounds.endedWeek(LocalDate.of(2026, 10, 26), MONDAY_JUST_AFTER_MIDNIGHT).firstDay())
                .isEqualTo(LocalDate.of(2026, 10, 26));
    }

    @Test
    @DisplayName("히트맵 주는 진행 중인 이번 주까지 받고, 다음 주·53주 전·월요일 아님은 각자의 코드로 거절한다")
    void startedWeekAcceptsCurrentWeek() {
        assertThat(WeekBounds.startedWeek(LocalDate.of(2026, 11, 2), MONDAY_JUST_AFTER_MIDNIGHT).lastDay())
                .isEqualTo(LocalDate.of(2026, 11, 8));
        assertThat(WeekBounds.startedWeek(LocalDate.of(2025, 11, 3), MONDAY_JUST_AFTER_MIDNIGHT).firstDay())
                .isEqualTo(LocalDate.of(2025, 11, 3));
        assertStartedRejected(LocalDate.of(2026, 11, 9), "WEEK_IN_FUTURE");
        assertStartedRejected(LocalDate.of(2025, 10, 27), "WEEK_TOO_OLD");
        assertStartedRejected(LocalDate.of(2026, 11, 3), "WEEK_NOT_MONDAY");
    }

    @Test
    @DisplayName("서버가 정한 이번 주는 KST 날짜가 든 주다 — UTC 날짜가 아직 일요일이어도 KST 월요일이면 그 월요일 주")
    void currentWeekFollowsKstDate() {
        assertThat(WeekBounds.currentWeek(MONDAY_JUST_AFTER_MIDNIGHT).firstDay()).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(WeekBounds.currentWeek(MONDAY_JUST_AFTER_MIDNIGHT).lastDay()).isEqualTo(LocalDate.of(2026, 11, 8));
        assertThat(WeekBounds.currentWeek(SUNDAY_JUST_BEFORE_MIDNIGHT).firstDay()).isEqualTo(LocalDate.of(2026, 10, 26));
    }

    private static void assertRejected(LocalDate weekStart, Clock clock, String expectedCode) {
        assertThatThrownBy(() -> WeekBounds.endedWeek(weekStart, clock))
                .isInstanceOfSatisfying(AdminConsoleException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo(expectedCode));
    }

    private static void assertStartedRejected(LocalDate weekStart, String expectedCode) {
        assertThatThrownBy(() -> WeekBounds.startedWeek(weekStart, MONDAY_JUST_AFTER_MIDNIGHT))
                .isInstanceOfSatisfying(AdminConsoleException.class,
                        exception -> assertThat(exception.getCode()).isEqualTo(expectedCode));
    }
}
