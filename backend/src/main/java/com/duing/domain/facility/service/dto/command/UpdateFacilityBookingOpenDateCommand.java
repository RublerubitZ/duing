package com.duing.domain.facility.service.dto.command;

import java.time.LocalDate;

/** 시설 1건의 예약 오픈일 변경 커맨드. bookingOpenDate null = 닫기. */
public record UpdateFacilityBookingOpenDateCommand(Long facilityId, LocalDate bookingOpenDate) {}
