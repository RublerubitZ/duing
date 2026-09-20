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
            description = "yearMonth 생략 시 현재월. 직전 달·이번 달·다음 달만 조회 가능(월 조회 범위). "
                    + "실제 신청 가능 구간은 시설별 오픈일이 정하는 bookableFrom/bookableUntil 이며, "
                    + "bookableFrom > bookableUntil 이면 아직 열리지 않은(닫힌) 시설이다.")
    @GetMapping("/facilities/{facilityId}/availability")
    ResponseEntity<ApiResponse<FacilityAvailabilityResponse>> getAvailability(
            @PathVariable Long facilityId,
            @RequestParam(required = false) @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);

    @Operation(summary = "현재 예약 오픈 구간 (비로그인, 폐기 예정)", deprecated = true,
            description = "시설 무관 참조 창(오늘 ~ 익월 말일). 시설별 신청 가능 구간은 가용성 응답의 "
                    + "bookableFrom/bookableUntil 이 단일 진실이며, 이 엔드포인트는 구 FE 호환용으로 "
                    + "한 릴리스만 유지한 뒤 삭제된다.")
    @Deprecated
    @GetMapping("/facilities/booking-window")
    ResponseEntity<ApiResponse<BookingWindowResponse>> getBookingWindow();

    @Operation(summary = "사용 목적 Preset 목록 (비로그인)")
    @GetMapping("/facilities/booking-purpose-presets")
    ResponseEntity<ApiResponse<List<PurposePresetResponse>>> listPurposePresets();
}
