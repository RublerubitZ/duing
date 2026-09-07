package com.duing.domain.facility.controller;

import com.duing.domain.facility.api.AdminFacilityApi;
import com.duing.domain.facility.controller.dto.request.UpdateFacilityBookingOpenDateRequest;
import com.duing.domain.facility.controller.dto.response.AdminFacilityResponse;
import com.duing.domain.facility.service.FacilityAdminService;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFacilityController implements AdminFacilityApi {

    private final FacilityAdminService facilityAdminService;

    /** 총동연이 방금 저장한 오픈일이 목록에 반영되어야 하므로 공개 목록(60초 public)과 달리 캐시하지 않는다. */
    @Override
    public ResponseEntity<ApiResponse<List<AdminFacilityResponse>>> listFacilities() {
        List<AdminFacilityResponse> facilities = facilityAdminService.listActiveFacilities().stream()
                .map(AdminFacilityResponse::from)
                .toList();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(facilities));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateBookingOpenDate(
            @PathVariable Long facilityId,
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest
    ) {
        facilityAdminService.updateBookingOpenDate(updateFacilityBookingOpenDateRequest.toCommand(facilityId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateAllBookingOpenDate(
            @Valid @RequestBody UpdateFacilityBookingOpenDateRequest updateFacilityBookingOpenDateRequest
    ) {
        facilityAdminService.updateAllBookingOpenDate(updateFacilityBookingOpenDateRequest.bookingOpenDate(),
                updateFacilityBookingOpenDateRequest.bookingCloseDate());
        return ResponseEntity.noContent().build();
    }
}
