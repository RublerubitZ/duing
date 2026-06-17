package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderFeeSummaryApi;
import com.duing.domain.fee.controller.dto.response.FeeSummaryResponse;
import com.duing.domain.fee.service.FeeBillSummaryService;
import com.duing.domain.fee.service.dto.query.FeeBillSummary;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
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
@PreAuthorize("isAuthenticated()")
public class LeaderFeeSummaryController implements LeaderFeeSummaryApi {

    private final FeeBillSummaryService feeBillSummaryService;

    @Override
    public ResponseEntity<ApiResponse<FeeSummaryResponse>> getSummary(
            @PathVariable Long clubId,
            @RequestParam(required = false) String billingPeriod,
            @RequestParam(required = false) Long policyId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        FeeBillSummary summary = feeBillSummaryService.getSummary(
                clubId, currentUser.id(), new FeeBillSummaryQuery(billingPeriod, policyId));
        return ResponseEntity.ok(ApiResponse.success(FeeSummaryResponse.from(summary)));
    }
}
