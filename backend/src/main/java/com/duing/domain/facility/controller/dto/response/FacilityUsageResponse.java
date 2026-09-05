package com.duing.domain.facility.controller.dto.response;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.ReservationStatus;
import com.duing.domain.facility.service.dto.query.FacilityUsageItem;
import com.duing.domain.facility.service.dto.query.FacilityUsageResult;
import com.duing.domain.facility.service.dto.query.ReservationSlot;
import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/** §7.2 이용현황 응답. lastUpdatedAt 은 절대시각(Instant, …Z), 시간은 HH:mm 문자열, room_seq 미노출. */
public record FacilityUsageResponse(String yearMonth, Instant lastUpdatedAt, boolean stale,
                                    DataSource source, List<FacilityUsage> facilities) {

    public record FacilityUsage(Long id, String roomName, String location, boolean isUsingNow,
                                Reservation currentReservation, Reservation nextReservation,
                                List<Reservation> reservations, LocalDate bookingOpenDate) {}

    public record Reservation(LocalDate date, String start, String end, String organization, ReservationStatus status) {}

    private static final DateTimeFormatter HH_MM = DateTimeFormatter.ofPattern("HH:mm");

    public static FacilityUsageResponse from(FacilityUsageResult result) {
        return new FacilityUsageResponse(
                result.yearMonth().toString(),
                TimeMapper.seoulWallClockToInstant(result.crawledAt()),
                result.stale(),
                result.source(),
                result.facilities().stream().map(FacilityUsageResponse::toFacility).toList());
    }

    static FacilityUsage toFacility(FacilityUsageItem item) {
        return new FacilityUsage(
                item.facilityId(), item.roomName(), item.location(), item.isUsingNow(),
                toReservation(item.currentReservation()), toReservation(item.nextReservation()),
                item.reservations().stream().map(FacilityUsageResponse::toReservation).toList(),
                item.bookingOpenDate());
    }

    static Reservation toReservation(ReservationSlot slot) {
        return slot == null ? null
                : new Reservation(slot.date(), slot.start().format(HH_MM), slot.end().format(HH_MM),
                        slot.organization(), slot.status());
    }
}
