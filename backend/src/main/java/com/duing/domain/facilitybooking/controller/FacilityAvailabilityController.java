package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.controller.api.FacilityAvailabilityApi;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityAvailabilityResponse;
import com.duing.domain.facilitybooking.controller.dto.response.PurposePresetResponse;
import com.duing.domain.facilitybooking.repository.FacilityBookingPurposePresetRepository;
import com.duing.domain.facilitybooking.service.FacilityAvailabilityService;
import com.duing.global.response.ApiResponse;
import java.time.Duration;
import java.time.YearMonth;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FacilityAvailabilityController implements FacilityAvailabilityApi {

    private final FacilityAvailabilityService facilityAvailabilityService;
    private final FacilityBookingPurposePresetRepository presetRepository;

    @Override
    public ResponseEntity<ApiResponse<FacilityAvailabilityResponse>> getAvailability(
            @PathVariable Long facilityId,
            @RequestParam(required = false) YearMonth yearMonth) {
        FacilityAvailabilityResponse availability =
                facilityAvailabilityService.getAvailability(facilityId, yearMonth);
        // PENDING_HOLD·BLOCKED 가 신청/승인 직후 즉시 반영돼야 하므로 캐시 금지(설계 §10)
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(availability));
    }

    @Override
    public ResponseEntity<ApiResponse<List<PurposePresetResponse>>> listPurposePresets() {
        List<PurposePresetResponse> presets = presetRepository.findByActiveTrueOrderBySortOrderAsc().stream()
                .map(PurposePresetResponse::from)
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofSeconds(60)).cachePublic())
                .body(ApiResponse.success(presets));
    }
}
