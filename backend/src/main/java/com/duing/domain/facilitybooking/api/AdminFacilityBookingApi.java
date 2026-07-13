package com.duing.domain.facilitybooking.api;

import com.duing.domain.facilitybooking.controller.dto.request.CancelFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.request.MarkConflictRequest;
import com.duing.domain.facilitybooking.controller.dto.request.RejectFacilityBookingRequest;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingCountsResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingDetailResponse;
import com.duing.domain.facilitybooking.controller.dto.response.AdminFacilityBookingSummaryResponse;
import com.duing.domain.facilitybooking.entity.BookingStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "시설 대관(총동연)", description = "총동연 전용 대관 신청 승인·관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFacilityBookingApi {

    @Operation(summary = "대관 신청 큐 조회", description = "기본 최신순. APPROVED 에 학교 반영 대기 경과일·충돌 의심 플래그 포함.")
    @GetMapping("/admin/facility-bookings")
    ResponseEntity<ApiResponse<PageResponse<AdminFacilityBookingSummaryResponse>>> getQueue(
            @Parameter(description = "상태 필터") @RequestParam(required = false) BookingStatus status,
            @Parameter(description = "시설 필터") @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @Parameter(hidden = true) Pageable pageable);

    @Operation(summary = "대관 신청 상세", description = "해당 월 온디맨드 재크롤을 시도하고 크롤 신선도·겹침 컨텍스트·이력을 포함한다(§5.2).")
    @GetMapping("/admin/facility-bookings/{bookingId}")
    ResponseEntity<ApiResponse<AdminFacilityBookingDetailResponse>> getDetail(@PathVariable Long bookingId);

    @Operation(summary = "승인", description = "저장 스냅샷 기준 재검증(시설 잠금). 학교 점유 충돌 시 409 FACILITY_BOOKING_SCHOOL_CONFLICT.")
    @PostMapping("/admin/facility-bookings/{bookingId}/approve")
    ResponseEntity<ApiResponse<Void>> approve(@PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "거절")
    @PostMapping("/admin/facility-bookings/{bookingId}/reject")
    ResponseEntity<ApiResponse<Void>> reject(@PathVariable Long bookingId,
            @Valid @RequestBody RejectFacilityBookingRequest rejectFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "수동 확정", description = "자동 매칭 불발(학교 표기 차이) 건의 관리자 확정.")
    @PostMapping("/admin/facility-bookings/{bookingId}/confirm")
    ResponseEntity<ApiResponse<Void>> confirm(@PathVariable Long bookingId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "충돌 전환", description = "승인 후 학교 데이터 충돌 확인 시 수동 전환(P1).")
    @PostMapping("/admin/facility-bookings/{bookingId}/conflict")
    ResponseEntity<ApiResponse<Void>> markConflict(@PathVariable Long bookingId,
            @Valid @RequestBody MarkConflictRequest markConflictRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "관리자 취소", description = "APPROVED·CONFLICT 취소. 사유는 이력에 기록.")
    @PostMapping("/admin/facility-bookings/{bookingId}/cancel")
    ResponseEntity<ApiResponse<Void>> cancel(@PathVariable Long bookingId,
            @Valid @RequestBody CancelFacilityBookingRequest cancelFacilityBookingRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "대시보드 카드 수치", description = "승인 대기·학교 반영 대기·충돌·이달 확정(§9.7).")
    @GetMapping("/admin/facility-bookings/summary")
    ResponseEntity<ApiResponse<AdminFacilityBookingCountsResponse>> getSummary();
}
