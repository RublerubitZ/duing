package com.duing.domain.report.api;

import com.duing.domain.report.controller.dto.request.ProcessReportRequest;
import com.duing.domain.report.controller.dto.response.ReportDetailResponse;
import com.duing.domain.report.controller.dto.response.ReportSummaryResponse;
import com.duing.domain.report.entity.ReportStatus;
import com.duing.domain.report.entity.ReportTargetType;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "신고(총동연)", description = "총동연 전용 신고 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminReportApi {

    @Operation(summary = "신고 목록 조회")
    @GetMapping("/admin/reports")
    ResponseEntity<ApiResponse<PageResponse<ReportSummaryResponse>>> getReports(
            @RequestParam(required = false) ReportStatus status,
            @RequestParam(required = false) ReportTargetType targetType,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "신고 상세 조회")
    @GetMapping("/admin/reports/{reportId}")
    ResponseEntity<ApiResponse<ReportDetailResponse>> getReport(@PathVariable Long reportId);

    @Operation(summary = "신고 처리")
    @PatchMapping("/admin/reports/{reportId}")
    ResponseEntity<ApiResponse<Void>> processReport(
            @PathVariable Long reportId,
            @Valid @RequestBody ProcessReportRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
