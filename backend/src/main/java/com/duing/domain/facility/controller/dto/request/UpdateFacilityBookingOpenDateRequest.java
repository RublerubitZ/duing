package com.duing.domain.facility.controller.dto.request;

import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.LocalDate;

/** bookingOpenDate 는 nullable — null 은 "닫기". 형식 오류(yyyy-MM-dd 아님)는 역직렬화 400. */
public record UpdateFacilityBookingOpenDateRequest(LocalDate bookingOpenDate) {

    public UpdateFacilityBookingOpenDateCommand toCommand(Long facilityId) {
        return new UpdateFacilityBookingOpenDateCommand(facilityId, bookingOpenDate);
    }
}
