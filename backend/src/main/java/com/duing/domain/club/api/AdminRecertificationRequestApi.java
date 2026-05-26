package com.duing.domain.club.api;

import com.duing.domain.club.controller.dto.request.ProcessRecertificationRequest;
import com.duing.domain.club.controller.dto.response.CentralClubRecertificationStatusResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestDetailResponse;
import com.duing.domain.club.controller.dto.response.RecertificationRequestSummaryResponse;
import com.duing.domain.club.entity.RecertificationStatus;
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

@Tag(name = "재인증 제출(총동연)", description = "총동연 전용 재인증 검토/처리 + 미인증 동아리 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminRecertificationRequestApi {

    @Operation(summary = "재인증 제출 목록")
    @GetMapping("/admin/recertification-requests")
    ResponseEntity<ApiResponse<PageResponse<RecertificationRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) Long roundId,
            @RequestParam(required = false) RecertificationStatus status,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "재인증 제출 상세")
    @GetMapping("/admin/recertification-requests/{requestId}")
    ResponseEntity<ApiResponse<RecertificationRequestDetailResponse>> getRequest(
            @PathVariable Long requestId
    );

    @Operation(summary = "재인증 처리")
    @PatchMapping("/admin/recertification-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessRecertificationRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "중앙동아리 재인증 상태 조회 (EXPIRED 포함)")
    @GetMapping("/admin/clubs/recertification-status")
    ResponseEntity<ApiResponse<PageResponse<CentralClubRecertificationStatusResponse>>> listClubStatuses(
            @RequestParam int operatingYear,
            @Parameter(hidden = true) Pageable pageable
    );
}
