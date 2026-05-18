package com.duing.domain.recruitment.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentDisplayStatusTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 5, 18);

    @Test
    @DisplayName("CLOSED 상태는 날짜와 무관하게 CLOSED 로 도출된다")
    void closedStatusAlwaysResolvesToClosed() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.CLOSED,
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 31),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }

    @Test
    @DisplayName("시작일이 오늘 이후면 UPCOMING 으로 도출된다")
    void beforeStartDateResolvesToUpcoming() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 20),
                LocalDate.of(2026, 5, 30),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.UPCOMING);
    }

    @Test
    @DisplayName("OPEN + endDate 가 null 이고 시작일이 도래했으면 ALWAYS_OPEN 으로 도출된다")
    void openWithNullEndDateAfterStartIsAlwaysOpen() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 1),
                null,
                TODAY)).isEqualTo(RecruitmentDisplayStatus.ALWAYS_OPEN);
    }

    @Test
    @DisplayName("OPEN + 시작일~종료일 사이면 OPEN 으로 도출된다")
    void openWithinPeriodResolvesToOpen() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 10),
                LocalDate.of(2026, 5, 30),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.OPEN);
    }

    @Test
    @DisplayName("OPEN 이지만 종료일이 지났으면 CLOSED 로 도출된다 (자동 만료)")
    void openButPastEndDateResolvesToClosed() {
        assertThat(RecruitmentDisplayStatus.resolve(
                RecruitmentStatus.OPEN,
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 10),
                TODAY)).isEqualTo(RecruitmentDisplayStatus.CLOSED);
    }
}
