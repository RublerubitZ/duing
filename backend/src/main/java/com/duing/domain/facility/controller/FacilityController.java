package com.duing.domain.facility.controller;

import com.duing.domain.facility.api.FacilityApi;
import com.duing.domain.facility.controller.dto.response.FacilityDetailResponse;
import com.duing.domain.facility.controller.dto.response.FacilitySummaryResponse;
import com.duing.domain.facility.controller.dto.response.FacilityUsageResponse;
import com.duing.domain.facility.service.FacilityUsageService;
import com.duing.global.response.ApiResponse;
import java.time.Duration;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FacilityController implements FacilityApi {

    private final FacilityUsageService facilityUsageService;

    private static CacheControl publicCache() {
        return CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic();
    }

    @Override
    public ResponseEntity<ApiResponse<List<FacilitySummaryResponse>>> listFacilities() {
        List<FacilitySummaryResponse> facilities = facilityUsageService.getActiveFacilities().stream()
                .map(FacilitySummaryResponse::from)
                .toList();
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(facilities));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityUsageResponse>> getUsage(YearMonth yearMonth) {
        FacilityUsageResponse response = FacilityUsageResponse.from(facilityUsageService.getUsage(yearMonth));
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityDetailResponse>> getFacilityDetail(Long facilityId, YearMonth yearMonth) {
        FacilityDetailResponse response =
                FacilityDetailResponse.from(facilityUsageService.getDetail(facilityId, yearMonth));
        return ResponseEntity.ok().cacheControl(publicCache()).body(ApiResponse.success(response));
    }
}
