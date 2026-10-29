package com.duing.domain.adminconsole.api;

import com.duing.domain.adminconsole.controller.dto.response.AdminPendingCountsResponse;
import com.duing.domain.adminconsole.controller.dto.response.AdminPendingTrendResponse;
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

    @Operation(summary = "처리 대기 추이 조회",
            description = "총동연 홈 추이 카드용 — 지난 13일 하루 끝 남은 대기 건수(기록 없는 날 null)와 "
                    + "최근 7일 접수·처리 건수(신고·문의·시설 예약·홍보·회장 승계)")
    @GetMapping("/admin/pending-trend")
    ResponseEntity<ApiResponse<AdminPendingTrendResponse>> getPendingTrend();
}
