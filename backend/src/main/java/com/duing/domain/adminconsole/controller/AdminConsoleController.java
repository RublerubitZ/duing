package com.duing.domain.adminconsole.controller;

import com.duing.domain.adminconsole.api.AdminConsoleApi;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingCountsResponse;
import com.duing.domain.adminconsole.service.AdminPendingCountsQueryService;
import com.duing.global.response.ApiResponse;
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

    @Override
    public ResponseEntity<ApiResponse<AdminPendingCountsResponse>> getPendingCounts() {
        return ResponseEntity.ok(ApiResponse.success(adminPendingCountsQueryService.getPendingCounts()));
    }
}
