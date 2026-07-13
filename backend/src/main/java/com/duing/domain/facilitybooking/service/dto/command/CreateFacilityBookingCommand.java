package com.duing.domain.facilitybooking.service.dto.command;

import java.time.LocalDate;
import java.time.LocalTime;

public record CreateFacilityBookingCommand(
        Long clubId,
        Long actorId,
        Long facilityId,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        String purpose,
        Integer attendeeCount
) {}
