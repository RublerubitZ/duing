package com.duing.domain.facility.service.dto.query;

import java.time.LocalDate;
import java.util.List;

/** 시설 1건의 이용현황 슬라이스(내부 query DTO). room_seq 는 포함하지 않는다. */
public record FacilityUsageItem(Long facilityId, String roomName, String location, boolean isUsingNow,
                                ReservationSlot currentReservation, ReservationSlot nextReservation,
                                List<ReservationSlot> reservations, LocalDate bookingOpenDate) {}
