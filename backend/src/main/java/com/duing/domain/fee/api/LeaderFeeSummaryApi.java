package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.response.FeeSummaryResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회비 수납 현황 (운영진)", description = "LEADER/OFFICER 회비 수납 현황 집계 대시보드")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderFeeSummaryApi {

    @Operation(summary = "회비 수납 현황 집계 조회 (LEADER/OFFICER)",
            description = "동아리 청구의 총 청구액·총 납부액·미수금·수납률·청구 건수·상태별 건수를 회차·정책 필터로 집계한다. "
                    + "취소(CANCELLED) 청구와 정정(VOID) 납부는 집계에서 제외된다.")
    @GetMapping("/leader/clubs/{clubId}/fee-bills/summary")
    ResponseEntity<ApiResponse<FeeSummaryResponse>> getSummary(
            @PathVariable Long clubId,
            @RequestParam(required = false) String billingPeriod,
            @RequestParam(required = false) Long policyId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
