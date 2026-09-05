package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 시설별 예약 오픈일 정책의 순수 판정 — 창 = [max(오픈일, 오늘), 익월 말일], 오픈일 NULL = 닫힘(빈 창).
 * Clock 을 갖지 않는 순수 함수라 "오늘"을 인자로 넘겨 실행 시각과 무관하게 고정 검증한다.
 */
class BookingOpenDatePolicyTest {

    private final BookingOpenDatePolicy policy = new BookingOpenDatePolicy();

    @Test
    @DisplayName("오픈일이 없으면 닫힌 창(시작 = 익월 말일 + 1)이라 어떤 날짜도 포함하지 않는다")
    void nullOpenDateProducesClosedWindow() {
        LocalDate today = LocalDate.of(2026, 1, 10);

        BookingWindow window = policy.windowFor(null, today);

        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 3, 1));
        assertThat(window.isEmpty()).isTrue();
        assertThat(window.contains(today)).isFalse();
    }

    @Test
    @DisplayName("과거 오픈일은 오늘로 당겨지고, 오늘·익월 안 미래 오픈일은 그대로 창의 시작이 된다")
    void openDateIsClampedToToday() {
        LocalDate today = LocalDate.of(2026, 1, 10);

        assertThat(policy.windowFor(LocalDate.of(2020, 1, 1), today).from()).isEqualTo(today);
        assertThat(policy.windowFor(today, today).from()).isEqualTo(today);
        assertThat(policy.windowFor(LocalDate.of(2026, 2, 20), today).from())
                .isEqualTo(LocalDate.of(2026, 2, 20));
    }

    @Test
    @DisplayName("창의 끝은 언제나 익월 말일이다 — 말일이 짧은 달·윤년·연말 넘김 모두 포함")
    void untilIsAlwaysEndOfNextMonth() {
        assertThat(policy.windowFor(null, LocalDate.of(2026, 1, 31)).until())
                .isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(policy.windowFor(null, LocalDate.of(2024, 1, 31)).until())
                .isEqualTo(LocalDate.of(2024, 2, 29));
        assertThat(policy.windowFor(null, LocalDate.of(2026, 12, 5)).until())
                .isEqualTo(LocalDate.of(2027, 1, 31));
    }

    @Test
    @DisplayName("익월 말일보다 늦은 오픈일은 시작이 끝을 넘어 빈 창이 된다")
    void openDateBeyondUntilProducesEmptyWindow() {
        LocalDate today = LocalDate.of(2026, 1, 10);
        LocalDate afterUntil = LocalDate.of(2026, 3, 1);

        BookingWindow window = policy.windowFor(afterUntil, today);

        assertThat(window.from()).isEqualTo(afterUntil);
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(window.isEmpty()).isTrue();
    }

    @Test
    @DisplayName("contains 는 양 끝을 포함하고 그 바깥은 제외한다")
    void containsIncludesBothBounds() {
        BookingWindow window = policy.windowFor(LocalDate.of(2026, 1, 20), LocalDate.of(2026, 1, 10));

        assertThat(window.contains(LocalDate.of(2026, 1, 19))).isFalse();
        assertThat(window.contains(LocalDate.of(2026, 1, 20))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 2, 28))).isTrue();
        assertThat(window.contains(LocalDate.of(2026, 3, 1))).isFalse();
    }

    @Test
    @DisplayName("참조 창은 오픈일과 무관하게 오늘부터 익월 말일까지다")
    void referenceWindowIgnoresOpenDate() {
        BookingWindow window = policy.referenceWindow(LocalDate.of(2026, 1, 10));

        assertThat(window.from()).isEqualTo(LocalDate.of(2026, 1, 10));
        assertThat(window.until()).isEqualTo(LocalDate.of(2026, 2, 28));
        assertThat(window.isEmpty()).isFalse();
    }
}
