package com.duing.domain.adminconsole.controller;

import com.duing.domain.adminconsole.api.AdminConsoleApi;
import com.duing.domain.adminconsole.controller.dto.response.AdminClubSignalsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminJobStatusesResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingCountsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingTrendResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminWeeklyBriefingResponse;
import com.duing.domain.adminconsole.service.AdminClubSignalsQueryService;
import com.duing.domain.adminconsole.service.AdminJobStatusQueryService;
import com.duing.domain.adminconsole.service.AdminPendingCountsQueryService;
import com.duing.domain.adminconsole.service.AdminPendingTrendQueryService;
import com.duing.domain.adminconsole.service.AdminWeeklyBriefingQueryService;
import com.duing.global.response.ApiResponse;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminConsoleController implements AdminConsoleApi {

    private final AdminPendingCountsQueryService adminPendingCountsQueryService;
    private final AdminPendingTrendQueryService adminPendingTrendQueryService;
    private final AdminJobStatusQueryService adminJobStatusQueryService;
    private final AdminClubSignalsQueryService adminClubSignalsQueryService;
    private final AdminWeeklyBriefingQueryService adminWeeklyBriefingQueryService;

    @Override
    public ResponseEntity<ApiResponse<AdminPendingCountsResponse>> getPendingCounts() {
        return ResponseEntity.ok(ApiResponse.success(
                AdminPendingCountsResponse.from(adminPendingCountsQueryService.getPendingCounts())));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminPendingTrendResponse>> getPendingTrend() {
        return ResponseEntity.ok(ApiResponse.success(
                AdminPendingTrendResponse.from(adminPendingTrendQueryService.getTrend())));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminJobStatusesResponse>> getJobStatuses() {
        return ResponseEntity.ok(ApiResponse.success(
                AdminJobStatusesResponse.from(adminJobStatusQueryService.getJobStatuses())));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminClubSignalsResponse>> getClubSignals() {
        return ResponseEntity.ok(ApiResponse.success(
                AdminClubSignalsResponse.from(adminClubSignalsQueryService.getClubSignals())));
    }

    @Override
    public ResponseEntity<ApiResponse<AdminWeeklyBriefingResponse>> getWeeklyBriefing(LocalDate weekStart) {
        return ResponseEntity.ok(ApiResponse.success(
                AdminWeeklyBriefingResponse.from(adminWeeklyBriefingQueryService.getWeeklyBriefing(weekStart))));
    }
}
