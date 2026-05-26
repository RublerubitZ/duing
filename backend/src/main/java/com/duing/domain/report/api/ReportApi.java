package com.duing.domain.report.api;

import com.duing.domain.report.controller.dto.request.CreateReportRequest;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "신고", description = "Club/Recruitment 신고 제출 API")
@SecurityRequirement(name = "BearerAuth")
public interface ReportApi {

    @Operation(summary = "신고 제출", description = "로그인 사용자가 동아리/모집공고를 신고한다.")
    @PostMapping("/reports")
    ResponseEntity<ApiResponse<Long>> createReport(
            @Valid @RequestBody CreateReportRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
