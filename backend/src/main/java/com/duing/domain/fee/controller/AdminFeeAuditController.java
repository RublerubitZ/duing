package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.AdminFeeAuditApi;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubDetailResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubSummaryResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeDashboardResponse;
import com.duing.domain.fee.service.AdminFeeAuditQueryService;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFeeAuditController implements AdminFeeAuditApi {

    private final AdminFeeAuditQueryService adminFeeAuditQueryService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFeeClubSummaryResponse>>> searchFeeClubs(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) AdminFeeUsageFilter usage,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "OUTSTANDING") AdminFeeClubSort sort,
            Pageable pageable
    ) {
        Page<AdminFeeClubSummaryResponse> page = adminFeeAuditQueryService
                .searchClubs(q, usage, AdminFeePeriod.of(from, to), sort, pageable)
                .map(AdminFeeClubSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFeeDashboardResponse>> getFeeDashboard(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(ApiResponse.success(AdminFeeDashboardResponse.from(
                adminFeeAuditQueryService.getDashboard(AdminFeePeriod.of(from, to)))));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFeeClubDetailResponse>> getFeeClubDetail(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        return ResponseEntity.ok(ApiResponse.success(AdminFeeClubDetailResponse.from(
                adminFeeAuditQueryService.getClubDetail(
                        clubId, AdminFeePeriod.of(from, to), currentUser.id()))));
    }
}
