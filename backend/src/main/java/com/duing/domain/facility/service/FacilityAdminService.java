package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.Facility;
import com.duing.domain.facility.service.dto.command.UpdateFacilityBookingOpenDateCommand;
import java.time.LocalDate;
import java.util.List;

public interface FacilityAdminService {

    List<Facility> listActiveFacilities();

    void updateBookingOpenDate(UpdateFacilityBookingOpenDateCommand command);

    void updateAllBookingOpenDate(LocalDate bookingOpenDate);
}
