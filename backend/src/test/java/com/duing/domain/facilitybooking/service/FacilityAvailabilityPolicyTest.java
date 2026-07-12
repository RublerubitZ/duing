package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityAvailabilityPolicyTest {

    private final FacilityAvailabilityPolicy policy = new FacilityAvailabilityPolicy();

    private FacilityReservation row(LocalTime reservedStart, LocalTime reservedEnd) {
        LocalDate date = LocalDate.of(2026, 1, 15);
        return FacilityReservation.create(1L, 100L, YearMonth.from(date), date,
                LocalTime.of(9, 0), LocalTime.of(10, 0), "고정관념",
                reservedStart, reservedEnd, LocalDateTime.of(2026, 1, 15, 8, 0));
    }

    @Test
    @DisplayName("운영시간 꼬리가 없는 행은 점유행(OCCUPIED)이다")
    void rowWithoutOperatingHoursIsOccupied() {
        assertThat(policy.classify(row(null, null))).isEqualTo(CrawlRowType.OCCUPIED);
    }

    @Test
    @DisplayName("운영시간 꼬리가 있는 행은 운영행(OPERATING)이다 — 슬롯을 차단하지 않는다")
    void rowWithOperatingHoursIsOperating() {
        assertThat(policy.classify(row(LocalTime.of(9, 0), LocalTime.of(20, 0))))
                .isEqualTo(CrawlRowType.OPERATING);
    }

    @Test
    @DisplayName("운영시간 꼬리가 반쪽만 파싱된 행(start 만 존재)은 점유행(OCCUPIED)으로 보수 처리된다")
    void rowWithHalfParsedOperatingHoursIsOccupied() {
        assertThat(policy.classify(row(LocalTime.of(9, 0), null))).isEqualTo(CrawlRowType.OCCUPIED);
    }
}
