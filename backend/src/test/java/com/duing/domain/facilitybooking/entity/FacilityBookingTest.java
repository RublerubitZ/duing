package com.duing.domain.facilitybooking.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingTest {

    private FacilityBooking pendingBooking() {
        return FacilityBooking.request(1L, 2L, 3L,
                LocalDate.of(2026, 1, 15), LocalTime.of(18, 0), LocalTime.of(20, 0),
                "정기 합주", 15);
    }

    private void forceStatus(FacilityBooking booking, BookingStatus status) throws Exception {
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
    }

    @Test
    @DisplayName("신청 생성 시 상태는 PENDING 이다")
    void requestCreatesPendingBooking() {
        assertThat(pendingBooking().getStatus()).isEqualTo(BookingStatus.PENDING);
    }

    @Test
    @DisplayName("PENDING 신청은 동아리가 취소할 수 있다")
    void cancelByClubFromPending() {
        FacilityBooking booking = pendingBooking();
        booking.cancelByClub();
        assertThat(booking.getStatus()).isEqualTo(BookingStatus.CANCELLED);
    }

    @Test
    @DisplayName("PENDING 이 아닌 상태에서 동아리 취소는 409 도메인 예외다")
    void cancelByClubRejectsNonPending() throws Exception {
        FacilityBooking booking = pendingBooking();
        forceStatus(booking, BookingStatus.APPROVED);
        assertThatThrownBy(booking::cancelByClub)
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("overlaps 는 경계 접촉(끝==시작)을 겹침으로 보지 않는다")
    void overlapsExcludesBoundaryTouch() {
        FacilityBooking booking = pendingBooking(); // 18~20
        assertThat(booking.overlaps(LocalTime.of(20, 0), LocalTime.of(21, 0))).isFalse();
        assertThat(booking.overlaps(LocalTime.of(17, 0), LocalTime.of(18, 0))).isFalse();
        assertThat(booking.overlaps(LocalTime.of(19, 0), LocalTime.of(21, 0))).isTrue();
    }

    @Test
    @DisplayName("BookingStatus 파생 속성 — 차단/상한/터미널")
    void statusDerivedFlags() {
        assertThat(BookingStatus.APPROVED.blocksSlot()).isTrue();
        assertThat(BookingStatus.CONFIRMED.blocksSlot()).isTrue();
        assertThat(BookingStatus.PENDING.blocksSlot()).isFalse();
        assertThat(BookingStatus.PENDING.countsTowardActiveCap()).isTrue();
        assertThat(BookingStatus.APPROVED.countsTowardActiveCap()).isTrue();
        assertThat(BookingStatus.CONFIRMED.countsTowardActiveCap()).isFalse();
        assertThat(BookingStatus.CONFIRMED.isTerminal()).isTrue();
        assertThat(BookingStatus.CONFLICT.isTerminal()).isFalse();
        // CONFLICT 는 "승인 이후 충돌" 상태라 슬롯을 여전히 차단한다고 오해하기 쉽다 —
        // 설계 §3.1 은 APPROVED/CONFIRMED 만 차단 대상으로 명시하므로 회귀 가드로 고정한다.
        assertThat(BookingStatus.CONFLICT.blocksSlot()).isFalse();
        assertThat(BookingStatus.CONFLICT.countsTowardActiveCap()).isFalse();
    }
}
