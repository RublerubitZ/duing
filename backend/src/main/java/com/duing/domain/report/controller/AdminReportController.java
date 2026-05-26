package com.duing.domain.report.controller;

import com.duing.domain.report.api.AdminReportApi;
import com.duing.domain.report.controller.dto.request.ProcessReportRequest;
import com.duing.domain.report.controller.dto.response.ReportDetailResponse;
import com.duing.domain.report.controller.dto.response.ReportSummaryResponse;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.domain.report.service.ReportService;
import com.duing.domain.report.service.dto.query.ReportAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
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
public class AdminReportController implements AdminReportApi {

    private final ReportService reportService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ReportSummaryResponse>>> getReports(
            ReportStatus status, ReportTargetType targetType, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                reportService.listForAdmin(new ReportAdminSearchCondition(status, targetType), pageable)
                        .map(ReportSummaryResponse::from))));
    }

    @Override
    public ResponseEntity<ApiResponse<ReportDetailResponse>> getReport(Long reportId) {
        return ResponseEntity.ok(ApiResponse.success(
                ReportDetailResponse.from(reportService.getDetailForAdmin(reportId))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processReport(
            Long reportId, @Valid @RequestBody ProcessReportRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        reportService.process(request.toCommand(reportId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
