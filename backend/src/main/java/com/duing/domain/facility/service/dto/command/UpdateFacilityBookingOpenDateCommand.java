package com.duing.domain.facility.service.dto.command;

import java.time.LocalDate;

/** 시설 1건의 예약 창 변경 커맨드. bookingOpenDate null = 닫기, bookingCloseDate null = 상한 없음(익월 말일). */
public record UpdateFacilityBookingOpenDateCommand(Long facilityId, LocalDate bookingOpenDate,
                                                   LocalDate bookingCloseDate) {}
