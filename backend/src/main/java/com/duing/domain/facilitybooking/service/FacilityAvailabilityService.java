package com.duing.domain.facilitybooking.service;

import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import java.time.YearMonth;
import java.util.List;

public interface FacilityAvailabilityService {

    /** 월 단위 가용성. requestedMonth null=현재월. 직전 월·당월·익월 외는 400(설계 §3.3·§8.1). 직전 월은 저장 스냅샷 기록 열람(재크롤 없음). */
    FacilityAvailabilityResponse getAvailability(Long facilityId, YearMonth requestedMonth);

    /** 시설 무관 참조 창(오늘~익월 말일) — 구 FE 호환용으로 한 릴리스만 유지한다. 시설별 창은 getAvailability 가 내린다. */
    @Deprecated
    BookingWindowResponse getBookingWindow();

    /** 신청 목적 프리셋 — 활성 항목만 노출 순서대로. */
    List<PurposePresetResponse> listActivePurposePresets();
}
