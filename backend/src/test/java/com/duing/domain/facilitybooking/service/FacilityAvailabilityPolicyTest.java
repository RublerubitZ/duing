package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
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

    @Test
    @DisplayName("occupiedOverlapping 은 같은 날짜의 점유행 중 반개구간이 겹치는 행만 남긴다 — 경계 접촉·다른 날짜·운영행은 제외")
    void occupiedOverlappingKeepsOnlyOverlappingOccupiedRows() {
        LocalDate date = LocalDate.of(2026, 1, 15);
        FacilityReservation overlapping = occupiedRow(date, LocalTime.of(9, 0), LocalTime.of(10, 0));
        // [10:00, 11:00) 는 조회 구간 [9:30, 10:00) 과 경계 접촉일 뿐 겹침이 아니다(반개구간).
        FacilityReservation adjacent = occupiedRow(date, LocalTime.of(10, 0), LocalTime.of(11, 0));
        FacilityReservation otherDate = occupiedRow(date.plusDays(1), LocalTime.of(9, 0), LocalTime.of(10, 0));
        // 운영행(OPERATING)은 같은 시간대라도 슬롯을 차단하지 않는다.
        FacilityReservation operating = row(LocalTime.of(9, 0), LocalTime.of(20, 0));

        List<FacilityReservation> result = policy.occupiedOverlapping(
                        List.of(overlapping, adjacent, otherDate, operating),
                        date, LocalTime.of(9, 30), LocalTime.of(10, 0))
                .toList();

        assertThat(result).containsExactly(overlapping);
    }

    private FacilityReservation occupiedRow(LocalDate date, LocalTime startTime, LocalTime endTime) {
        return FacilityReservation.create(1L, 100L, YearMonth.from(date), date,
                startTime, endTime, "학교단체", null, null, LocalDateTime.of(2026, 1, 15, 8, 0));
    }
}
