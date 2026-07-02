package com.duing.domain.facility.service.dto.query;

import com.duing.domain.facility.entity.ReservationStatus;
import java.time.LocalDate;
import java.time.LocalTime;

/** 병합·상태계산이 끝난 예약 슬롯(내부 query DTO). */
public record ReservationSlot(LocalDate date, LocalTime start, LocalTime end, String organization,
                              ReservationStatus status) {}
