package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import java.time.YearMonth;
import java.util.List;

public interface FacilityAvailabilityService {

    /** 월 단위 가용성. requestedMonth null=현재월, 당월·익월 외는 400(설계 §3.3·§8.1). */
    FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth);

    /** 현재 예약 오픈 구간(설계 §1.5) — 전 시설 공통, 시설 카드 화면용. */
    BookingWindowResponse getBookingWindow();

    /** 신청 목적 프리셋 — 활성 항목만 노출 순서대로. */
    List<PurposePresetResponse> listActivePurposePresets();
}
