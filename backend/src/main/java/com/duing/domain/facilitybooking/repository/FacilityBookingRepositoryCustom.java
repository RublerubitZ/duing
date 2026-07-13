package com.duing.domain.facilitybooking.repository;

import com.duing.domain.facilitybooking.entity.FacilityBooking;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FacilityBookingRepositoryCustom {

    Page<FacilityBooking> searchForAdmin(AdminBookingSearchCondition condition, Pageable pageable);
}
