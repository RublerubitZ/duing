package com.duing.domain.facilitybooking.entity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.duing.domain.facilitybooking.exception.FacilityBookingException;
import java.lang.reflect.Field;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FacilityBookingAdminTransitionTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 1, 15, 12, 0);

    private FacilityBooking booking(BookingStatus status) throws Exception {
        FacilityBooking booking = FacilityBooking.request(1L, 2L, 3L,
                LocalDate.of(2026, 1, 20), LocalTime.of(18, 0), LocalTime.of(20, 0), "정기 합주", null);
        Field statusField = FacilityBooking.class.getDeclaredField("status");
        statusField.setAccessible(true);
        statusField.set(booking, status);
        return booking;
    }

    @Test
    @DisplayName("승인은 PENDING·CONFLICT 에서만 가능하고 결정자·크롤 기준 시각을 기록하며 충돌 상세를 해제한다")
    void approveFromPendingOrConflict() throws Exception {
        FacilityBooking pending = booking(BookingStatus.PENDING);
        pending.approve(9L, NOW.minusMinutes(5), NOW);
        assertThat(pending.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(pending.getDecidedById()).isEqualTo(9L);
        assertThat(pending.getCrawlBasisAt()).isEqualTo(NOW.minusMinutes(5));

        FacilityBooking conflict = booking(BookingStatus.CONFLICT);
        Field detailField = FacilityBooking.class.getDeclaredField("conflictDetail");
        detailField.setAccessible(true);
        detailField.set(conflict, "문화팀 18~19 선점");
        conflict.approve(9L, NOW, NOW);
        assertThat(conflict.getStatus()).isEqualTo(BookingStatus.APPROVED);
        assertThat(conflict.getConflictDetail()).isNull();

        assertThatThrownBy(() -> booking(BookingStatus.CONFIRMED).approve(9L, NOW, NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("거절은 PENDING 에서만 가능하고 사유를 기록한다")
    void rejectOnlyFromPending() throws Exception {
        FacilityBooking pending = booking(BookingStatus.PENDING);
        pending.reject(9L, "시설 점검 기간", NOW);
        assertThat(pending.getStatus()).isEqualTo(BookingStatus.REJECTED);
        assertThat(pending.getRejectReason()).isEqualTo("시설 점검 기간");

        assertThatThrownBy(() -> booking(BookingStatus.APPROVED).reject(9L, "사유", NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("자동·수동 확정은 APPROVED 에서만 가능하고 확정 시각을 기록한다")
    void confirmOnlyFromApproved() throws Exception {
        FacilityBooking approved = booking(BookingStatus.APPROVED);
        approved.confirmByMatching(18134L, NOW.minusMinutes(3), NOW);
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CONFIRMED);
        assertThat(approved.getMatchedScheduleSeq()).isEqualTo(18134L);
        assertThat(approved.getConfirmedAt()).isEqualTo(NOW);

        FacilityBooking manual = booking(BookingStatus.APPROVED);
        manual.confirmManually(9L, NOW);
        assertThat(manual.getStatus()).isEqualTo(BookingStatus.CONFIRMED);

        assertThatThrownBy(() -> booking(BookingStatus.PENDING).confirmManually(9L, NOW))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }

    @Test
    @DisplayName("충돌 전환은 APPROVED 에서만, 관리자 취소는 APPROVED·CONFLICT 에서만 가능하다")
    void conflictAndAdminCancelGuards() throws Exception {
        FacilityBooking approved = booking(BookingStatus.APPROVED);
        approved.markConflict("문화팀 예약과 겹침");
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CONFLICT);
        assertThat(approved.getConflictDetail()).isEqualTo("문화팀 예약과 겹침");

        approved.cancelByAdmin();
        assertThat(approved.getStatus()).isEqualTo(BookingStatus.CANCELLED);

        assertThatThrownBy(() -> booking(BookingStatus.PENDING).markConflict("x"))
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
        assertThatThrownBy(() -> booking(BookingStatus.CONFIRMED).cancelByAdmin())
                .isInstanceOf(FacilityBookingException.InvalidStatusTransitionException.class);
    }
}
