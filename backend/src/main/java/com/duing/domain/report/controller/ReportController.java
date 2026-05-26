package com.duing.domain.report.controller;

import com.duing.domain.report.api.ReportApi;
import com.duing.domain.report.controller.dto.request.CreateReportRequest;
import com.duing.domain.report.service.ReportService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class ReportController implements ReportApi {

    private final ReportService reportService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createReport(
            CreateReportRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long reportId = reportService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(reportId));
    }
}
