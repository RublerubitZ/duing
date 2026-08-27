package com.duing.domain.facilitybooking.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.domain.facility.entity.FacilityReservation;
import com.duing.common.fixture.FacilityBookingFixture;
import com.duing.domain.facilitybooking.entity.FacilityBooking;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingMatchingServiceTest {

    // decide(...) 는 순수 판정(DB·Clock 미접근)이라 확정용 의존(리포지토리·스냅샷·시설·Clock)은 null 로 조립한다.
    private final FacilityBookingMatchingService matchingService =
            new FacilityBookingMatchingService(new OrganizationNameNormalizer(),
                    null, null, null, null, null, null, null);

    private static final LocalDate DATE = LocalDate.of(2026, 1, 20);

    private FacilityBooking approvedBooking(int startHour, int endHour) {
        FacilityBooking booking = FacilityBooking.request(1L, 2L, 3L, DATE,
                LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), "정기 합주", null,
                FacilityBookingFixture.VALID_CONTACT_PHONE);
        booking.approve(9L, null, LocalDateTime.of(2026, 1, 20, 9, 0));
        return booking;
    }

    private FacilityReservation occupiedRow(long scheduleSeq, int startHour, String organization) {
        return FacilityReservation.create(1L, scheduleSeq, YearMonth.from(DATE), DATE,
                LocalTime.of(startHour, 0), LocalTime.of(startHour + 1, 0), organization, false, LocalDateTime.of(2026, 1, 20, 8, 0));
    }

    @Test
    @DisplayName("모든 서브슬롯이 같은 정규화 이름의 점유행으로 덮이면 CONFIRMED 판정이다")
    void confirmsWhenFullyCoveredByMatchingRows() {
        FacilityBooking booking = approvedBooking(18, 20);
        List<FacilityReservation> rows = List.of(
                occupiedRow(101L, 18, "밴드 부"), occupiedRow(102L, 19, "밴드부"));

        var decision = matchingService.decide(booking, "밴드부", rows);

        assertThat(decision.confirmed()).isTrue();
        assertThat(decision.matchedScheduleSeq()).isEqualTo(101L);
    }

    @Test
    @DisplayName("이름 불일치·부분 커버는 CONFIRMED 판정이 아니다")
    void staysWhenNameMismatchOrPartialCoverage() {
        FacilityBooking booking = approvedBooking(18, 20);

        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "문화팀"), occupiedRow(102L, 19, "문화팀"))).confirmed()).isFalse();
        assertThat(matchingService.decide(booking, "밴드부",
                List.of(occupiedRow(101L, 18, "밴드부"))).confirmed()).isFalse(); // 19~20 미커버
    }

    @Test
    @DisplayName("하이픈 꼬리로 전 구간 확장된 실예약 행도 같은 정규화 이름이면 커버로 인정한다")
    void expandedTailRowCoversWhenNameMatches() {
        FacilityBooking booking = approvedBooking(18, 20);
        // "밴드부(9:00-20:00)" 하이픈 행은 실예약 범위다 — 파서가 9~20 전 구간 행(securedTail=false)으로
        // 확장 저장하므로 정상 커버다(물결 확보 표기 행의 제외는 아래 securedTail 테스트).
        FacilityReservation expanded = FacilityReservation.create(1L, 103L, YearMonth.from(DATE), DATE,
                LocalTime.of(9, 0), LocalTime.of(20, 0), "밴드부", false, LocalDateTime.of(2026, 1, 20, 8, 0));

        var decision = matchingService.decide(booking, "밴드부", List.of(expanded));

        assertThat(decision.confirmed()).isTrue();
        assertThat(decision.matchedScheduleSeq()).isEqualTo(103L);
    }

    @Test
    @DisplayName("물결 꼬리 확보 표기 행은 이름이 일치해도 자동 확정 증거가 아니고, 실예약 행이 따로 덮으면 확정된다")
    void securedTailRowIsExcludedFromEvidence() {
        FacilityBooking booking = approvedBooking(18, 20);
        // 상시 확보 표기(물결) 행 — "학교가 이 예약을 반영했다"는 증거가 아니므로 행 단위로 제외한다(수정 8).
        FacilityReservation securedTailRow = FacilityReservation.create(1L, 105L, YearMonth.from(DATE), DATE,
                LocalTime.of(9, 0), LocalTime.of(20, 0), "밴드부", true, LocalDateTime.of(2026, 1, 20, 8, 0));

        assertThat(matchingService.decide(booking, "밴드부", List.of(securedTailRow)).confirmed()).isFalse();

        // 같은 동아리의 무꼬리 실예약 행이 함께 있으면 그 행만 증거로 커버를 인정한다(증거 복귀).
        var decision = matchingService.decide(booking, "밴드부",
                List.of(securedTailRow, occupiedRow(106L, 18, "밴드부"), occupiedRow(107L, 19, "밴드부")));

        assertThat(decision.confirmed()).isTrue();
        assertThat(decision.matchedScheduleSeq()).isEqualTo(106L);
    }

    @Test
    @DisplayName("비정렬 점유행(18:30~19:30)은 겹쳐도 커버가 아니다 — 부분 반영은 자동 확정하지 않는다")
    void nonAlignedRowDoesNotCover() {
        FacilityBooking booking = approvedBooking(18, 20);
        FacilityReservation nonAligned = FacilityReservation.create(1L, 104L, YearMonth.from(DATE), DATE,
                LocalTime.of(18, 30), LocalTime.of(19, 30), "밴드부", false, LocalDateTime.of(2026, 1, 20, 8, 0));

        assertThat(matchingService.decide(booking, "밴드부", List.of(nonAligned)).confirmed()).isFalse();
    }
}
