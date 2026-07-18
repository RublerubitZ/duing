package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.response.BookingWindowResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.YearMonth;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관 가용성", description = "시설 예약 신청용 슬롯 가용성 조회 (비로그인 포함)")
public interface FacilityAvailabilityApi {

    @Operation(summary = "월 단위 슬롯 가용성 (비로그인)",
            description = "yearMonth 생략 시 현재월. 이번 달·다음 달만 조회 가능(월 조회 범위 — 실제 신청 가능 구간은 bookableFrom/bookableUntil).")
    @GetMapping("/facilities/{facilityId}/availability")
    ResponseEntity<ApiResponse<FacilityAvailabilityResponse>> getAvailability(
            @PathVariable Long facilityId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);

    @Operation(summary = "현재 예약 오픈 구간 (비로그인)",
            description = "롤링 오픈 정책(현재 진행 중인 반월 + 다음 반월) 기준 신청 가능한 날짜 구간. "
                    + "단일 창(bookableFrom/bookableUntil)과 라벨링된 세부 구간(availableBookingRanges)을 함께 반환. 전 시설 공통.")
    @GetMapping("/facilities/booking-window")
    ResponseEntity<ApiResponse<BookingWindowResponse>> getBookingWindow();

    @Operation(summary = "사용 목적 Preset 목록 (비로그인)")
    @GetMapping("/facilities/booking-purpose-presets")
    ResponseEntity<ApiResponse<List<PurposePresetResponse>>> listPurposePresets();
}
