package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.request.CreateFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.CreateFacilityBookingResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityBookingDetailResponse;
import com.duing.domain.facilitybooking.controller.dto.response.FacilityBookingSummaryResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관 신청(동아리)", description = "동아리 운영진(LEADER/OFFICER) 전용 대관 신청")
@SecurityRequirement(name = "BearerAuth")
public interface ClubFacilityBookingApi {

    @Operation(summary = "대관 신청 생성",
            description = "운영진 전용. PENDING 겹침은 허용되며 overlappingPendingCount 로 경고 표시용 개수를 내린다.")
    @PostMapping("/clubs/{clubId}/facility-bookings")
    ResponseEntity<ApiResponse<CreateFacilityBookingResponse>> create(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFacilityBookingRequest createFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대관 신청 취소", description = "PENDING 상태에서만 신청 동아리가 취소할 수 있다.")
    @PostMapping("/clubs/{clubId}/facility-bookings/{bookingId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "동아리 대관 신청 목록", description = "운영진 전용. 최신순, status 로 필터 가능.")
    @GetMapping("/clubs/{clubId}/facility-bookings")
    ResponseEntity<ApiResponse<List<FacilityBookingSummaryResponse>>> getBookings(
            @PathVariable Long clubId,
            @RequestParam(required = false) BookingStatus status,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대관 신청 상세", description = "운영진 전용. 상태 이력(최신순) 포함.")
    @GetMapping("/clubs/{clubId}/facility-bookings/{bookingId}")
    ResponseEntity<ApiResponse<FacilityBookingDetailResponse>> getBooking(
            @PathVariable Long clubId,
            @PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);
}
