package com.duing.domain.user.profilecheck.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class SemesterTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    @ParameterizedTest(name = "{0} → {1}학년도 {2}학기")
    @CsvSource({
            "2027-01-01, 2026, 2",
            "2027-02-28, 2026, 2",
            "2028-02-29, 2027, 2",
            "2027-03-01, 2027, 1",
            "2027-08-31, 2027, 1",
            "2027-09-01, 2027, 2",
            "2027-12-31, 2027, 2"
    })
    @DisplayName("서울 날짜로 학기를 판정한다 — 3~8월은 그해 1학기, 9~12월은 그해 2학기, 1~2월은 전년 2학기")
    void judgesSemesterBySeoulDate(LocalDate seoulDate, int expectedYear, int expectedTerm) {
        assertThat(Semester.of(seoulDate)).isEqualTo(new Semester(expectedYear, expectedTerm));
    }

    @Test
    @DisplayName("서울 3월 1일 0시 직전은 전년 2학기이고 0시 정각부터는 그해 1학기다")
    void firstTermStartsAtSeoulMidnightOfMarchFirst() {
        Instant marchFirstMidnight = LocalDateTime.of(2027, 3, 1, 0, 0).atZone(SEOUL).toInstant();

        assertThat(Semester.current(Clock.fixed(marchFirstMidnight.minusNanos(1), SEOUL)))
                .isEqualTo(new Semester(2026, Semester.SECOND_TERM));
        assertThat(Semester.current(Clock.fixed(marchFirstMidnight, SEOUL)))
                .isEqualTo(new Semester(2027, Semester.FIRST_TERM));
    }

    @Test
    @DisplayName("학기 판정은 주입된 Clock 의 서울 날짜를 따른다 — UTC 로는 아직 2월 28일이어도 서울이 3월 1일이면 1학기다")
    void usesClockZoneNotUtcDate() {
        // 서울 2027-03-01 08:00 = UTC 2027-02-28 23:00
        Instant seoulMarchFirstMorning = LocalDateTime.of(2027, 3, 1, 8, 0).atZone(SEOUL).toInstant();

        assertThat(Semester.current(Clock.fixed(seoulMarchFirstMorning, SEOUL)))
                .isEqualTo(new Semester(2027, Semester.FIRST_TERM));
    }

    @Test
    @DisplayName("1학기만 isFirstTerm 이 참이다")
    void onlyFirstTermIsFirstTerm() {
        assertThat(new Semester(2027, Semester.FIRST_TERM).isFirstTerm()).isTrue();
        assertThat(new Semester(2027, Semester.SECOND_TERM).isFirstTerm()).isFalse();
    }
}
