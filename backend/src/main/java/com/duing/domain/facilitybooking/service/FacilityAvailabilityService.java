package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import java.time.YearMonth;

public interface FacilityAvailabilityService {

    /** 월 단위 가용성. requestedMonth null=현재월, 당월·익월 외는 400(설계 §3.3·§8.1). */
    FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth);
}
