package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.api.ClubFacilityBookingApi;
import com.duing.domain.facilitybooking.controller.dto.request.CreateFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.CreateFacilityBookingResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityBookingDetailResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityBookingSummaryResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ClubFacilityBookingController implements ClubFacilityBookingApi {

    private final FacilityBookingService facilityBookingService;

    @Override
    public ResponseEntity<ApiResponse<CreateFacilityBookingResponse>> create(
            @PathVariable Long clubId,
            @RequestBody CreateFacilityBookingRequest createFacilityBookingRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        FacilityBookingService.CreateResult result = facilityBookingService.create(
                createFacilityBookingRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(CreateFacilityBookingResponse.from(result)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        facilityBookingService.cancel(clubId, currentUser.id(), bookingId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<List<FacilityBookingSummaryResponse>>> getBookings(
            @PathVariable Long clubId,
            @RequestParam(required = false) BookingStatus status,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<FacilityBookingSummaryResponse> bookings =
                facilityBookingService.getBookings(clubId, currentUser.id(), status).stream()
                        .map(FacilityBookingSummaryResponse::from)
                        .toList();
        return ResponseEntity.ok(ApiResponse.success(bookings));
    }

    @Override
    public ResponseEntity<ApiResponse<FacilityBookingDetailResponse>> getBooking(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        return ResponseEntity.ok(ApiResponse.success(FacilityBookingDetailResponse.from(
                facilityBookingService.getBooking(clubId, currentUser.id(), bookingId))));
    }
}
