package com.duing.domain.adminconsole.api;

import com.duing.domain.adminconsole.controller.dto.response.AdminPendingCountsResponse;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "관리자 콘솔(총동연)", description = "총동연 관리자 콘솔 공통 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminConsoleApi {

    @Operation(summary = "미처리 건수 조회", description = "관리자 콘솔 사이드바 뱃지용 도메인별 미처리 건수와 총합")
    @GetMapping("/admin/pending-counts")
    ResponseEntity<ApiResponse<AdminPendingCountsResponse>> getPendingCounts();
}
