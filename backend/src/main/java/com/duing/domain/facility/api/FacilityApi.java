package com.duing.domain.facility.api;

import com.duing.domain.facility.controller.dto.response.FacilityDetailResponse;
import com.duing.domain.facility.controller.dto.response.FacilitySummaryResponse;
import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse;
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

@Tag(name = "시설 이용현황", description = "학생회관 공용시설 예약 이용현황 (비로그인 포함)")
public interface FacilityApi {

    @Operation(summary = "활성 시설 목록 (비로그인)")
    @GetMapping("/facilities")
    ResponseEntity<ApiResponse<List<FacilitySummaryResponse>>> listFacilities();

    @Operation(summary = "월별 이용현황 (비로그인). yearMonth 생략 시 현재월")
    @GetMapping("/facilities/usage")
    ResponseEntity<ApiResponse<FacilityUsageResponse>> getUsage(
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);

    @Operation(summary = "단일 시설 상세 (비로그인). yearMonth 생략 시 현재월")
    @GetMapping("/facilities/{facilityId}")
    ResponseEntity<ApiResponse<FacilityDetailResponse>> getFacilityDetail(
            @PathVariable Long facilityId,
            @RequestParam(required = false)
            @DateTimeFormat(pattern = "yyyy-MM") YearMonth yearMonth);
}
