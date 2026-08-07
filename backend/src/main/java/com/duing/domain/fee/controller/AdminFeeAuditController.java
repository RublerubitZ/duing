package com.duing.domain.fee.controller;

import com.duing.domain.clubaudit.entity.ClubAuditEventType;
import com.duing.domain.fee.api.AdminFeeAuditApi;
import com.duing.domain.fee.controller.dto.request.CreateFeeAuditCommentRequest;
import com.duing.domain.fee.controller.dto.request.UpdateFeeAuditCommentRequest;
import com.duing.domain.fee.controller.dto.response.AdminFeeAccountResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAnomalyReportResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAuditCommentResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeAuditLogResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeBillRowResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubDetailResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeClubSummaryResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeeDashboardResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeePaymentRowResponse;
import com.duing.domain.fee.controller.dto.response.AdminFeePolicyResponse;
import com.duing.domain.fee.entity.FeeAuditCommentKind;
import com.duing.domain.fee.entity.PaymentStatus;
import com.duing.domain.fee.service.AdminFeeAnomalyService;
import com.duing.domain.fee.service.AdminFeeAuditCommentService;
import com.duing.domain.fee.service.AdminFeeAuditQueryService;
import com.duing.domain.fee.service.dto.query.AdminFeeBillFilter;
import com.duing.domain.fee.service.dto.query.AdminFeeBillSort;
import com.duing.domain.fee.service.dto.query.AdminFeeClubSort;
import com.duing.domain.fee.service.dto.query.AdminFeePeriod;
import com.duing.domain.fee.service.dto.query.AdminFeeUsageFilter;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
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
@PreAuthorize("hasRole('ADMIN')")
public class AdminFeeAuditController implements AdminFeeAuditApi {

    private final AdminFeeAuditQueryService adminFeeAuditQueryService;
    private final AdminFeeAnomalyService adminFeeAnomalyService;
    private final AdminFeeAuditCommentService adminFeeAuditCommentService;

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

    @Override
    public ResponseEntity<ApiResponse<List<AdminFeePolicyResponse>>> getFeePolicies(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        List<AdminFeePolicyResponse> policies = adminFeeAuditQueryService
                .getPolicies(clubId, AdminFeePeriod.of(from, to)).stream()
                .map(AdminFeePolicyResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(policies));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFeeBillRowResponse>>> searchFeeBills(
            @PathVariable Long clubId,
            @RequestParam(required = false) AdminFeeBillFilter filter,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "LATEST") AdminFeeBillSort sort,
            Pageable pageable
    ) {
        Page<AdminFeeBillRowResponse> page = adminFeeAuditQueryService
                .searchBills(clubId, filter, q, AdminFeePeriod.of(from, to), sort, pageable)
                .map(AdminFeeBillRowResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFeePaymentRowResponse>>> searchFeePayments(
            @PathVariable Long clubId,
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            Pageable pageable
    ) {
        Page<AdminFeePaymentRowResponse> page = adminFeeAuditQueryService
                .searchPayments(clubId, status, AdminFeePeriod.of(from, to), pageable)
                .map(AdminFeePaymentRowResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminFeeAccountResponse>> getFeeAccount(@PathVariable Long clubId) {
        return ResponseEntity.ok(ApiResponse.success(
                AdminFeeAccountResponse.from(adminFeeAuditQueryService.getAccount(clubId))));
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFeeAuditLogResponse>>> searchFeeAuditLogs(
            @PathVariable Long clubId,
            @RequestParam(required = false) List<ClubAuditEventType> types,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            Pageable pageable
    ) {
        Page<AdminFeeAuditLogResponse> page = adminFeeAuditQueryService
                .getAuditLogs(clubId, types, AdminFeePeriod.of(from, to), pageable)
                .map(AdminFeeAuditLogResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    /** 기간 기본값(최근 30일)은 평가 창의 일부라 서비스가 정한다 — 여기서 AdminFeePeriod 로 굳히지 않는다. */
    @Override
    public ResponseEntity<ApiResponse<AdminFeeAnomalyReportResponse>> evaluateFeeAnomalies(
            @PathVariable Long clubId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to
    ) {
        return ResponseEntity.ok(ApiResponse.success(AdminFeeAnomalyReportResponse.from(
                adminFeeAnomalyService.evaluate(clubId, from, to))));
    }

    @Override
    public ResponseEntity<ApiResponse<List<AdminFeeAuditCommentResponse>>> getFeeAuditComments(
            @PathVariable Long clubId,
            @RequestParam(required = false) FeeAuditCommentKind kind
    ) {
        List<AdminFeeAuditCommentResponse> comments = adminFeeAuditCommentService.getComments(clubId, kind)
                .stream()
                .map(AdminFeeAuditCommentResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(comments));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createFeeAuditComment(
            @PathVariable Long clubId,
            @Valid @RequestBody CreateFeeAuditCommentRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long commentId = adminFeeAuditCommentService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(commentId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateFeeAuditComment(
            @PathVariable Long clubId,
            @PathVariable Long commentId,
            @Valid @RequestBody UpdateFeeAuditCommentRequest request
    ) {
        adminFeeAuditCommentService.update(request.toCommand(clubId, commentId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteFeeAuditComment(
            @PathVariable Long clubId,
            @PathVariable Long commentId
    ) {
        adminFeeAuditCommentService.delete(clubId, commentId);
        return ResponseEntity.noContent().build();
    }
}
