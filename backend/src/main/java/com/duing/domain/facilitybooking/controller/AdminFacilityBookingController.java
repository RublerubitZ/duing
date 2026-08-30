package com.duing.domain.facilitybooking.controller;

import com.duing.domain.facilitybooking.api.AdminFacilityBookingApi;
import com.duing.domain.facilitybooking.controller.dto.request.CancelFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.request.MarkConflictRequest;
import com.duing.domain.facilitybooking.controller.dto.request.RejectFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingCountsResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingDetailResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingSummaryResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminQueryService;
import com.duing.domain.facilitybooking.service.FacilityBookingAdminService;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingQueueSort;
import com.duing.domain.facilitybooking.service.dto.query.AdminBookingSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFacilityBookingController implements AdminFacilityBookingApi {

    private final FacilityBookingAdminQueryService queryService;
    private final FacilityBookingAdminService adminService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFacilityBookingSummaryResponse>>> getQueue(
            BookingStatus status, Long facilityId, LocalDate dateFrom, LocalDate dateTo,
            AdminBookingQueueSort sort, Pageable pageable) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                queryService.getQueue(
                                new AdminBookingSearchCondition(status, facilityId, dateFrom, dateTo, sort), pageable)
                        .map(AdminFacilityBookingSummaryResponse::from))));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFacilityBookingDetailResponse>> getDetail(Long bookingId) {
        return ResponseEntity.ok(ApiResponse.success(
                AdminFacilityBookingDetailResponse.from(queryService.getDetail(bookingId))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> approve(Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        adminService.approve(currentUser.id(), bookingId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> reject(Long bookingId,
            @Valid @RequestBody RejectFacilityBookingRequest rejectFacilityBookingRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        adminService.reject(currentUser.id(), bookingId, rejectFacilityBookingRequest.reason());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> confirm(Long bookingId,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        adminService.confirmManually(currentUser.id(), bookingId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> markConflict(Long bookingId,
            @Valid @RequestBody MarkConflictRequest markConflictRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        adminService.markConflict(currentUser.id(), bookingId, markConflictRequest.detail());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> cancel(Long bookingId,
            @Valid @RequestBody CancelFacilityBookingRequest cancelFacilityBookingRequest,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        adminService.cancel(currentUser.id(), bookingId, cancelFacilityBookingRequest.reason());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFacilityBookingCountsResponse>> getSummary() {
        return ResponseEntity.ok(ApiResponse.success(
                AdminFacilityBookingCountsResponse.from(queryService.getSummary())));
    }
}
