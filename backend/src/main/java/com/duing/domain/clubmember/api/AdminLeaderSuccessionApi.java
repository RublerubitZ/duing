package com.duing.domain.clubmember.api;

import com.duing.domain.clubmember.controller.dto.request.AssignAdminLeaderRequest;
import com.duing.domain.clubmember.controller.dto.request.ProcessLeaderSuccessionRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestDetailResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestSummaryResponse;
import com.duing.domain.clubmember.entity.SuccessionStatus;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회장 승계(총동연)", description = "총동연 전용 승계 처리 / 강제 지정 / 이력 조회")
@SecurityRequirement(name = "BearerAuth")
public interface AdminLeaderSuccessionApi {

    @Operation(summary = "승계 요청 목록")
    @GetMapping("/admin/leader-succession-requests")
    ResponseEntity<ApiResponse<PageResponse<SuccessionRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) SuccessionStatus status,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "승계 요청 상세")
    @GetMapping("/admin/leader-succession-requests/{requestId}")
    ResponseEntity<ApiResponse<SuccessionRequestDetailResponse>> getRequest(
            @PathVariable Long requestId
    );

    @Operation(summary = "승계 요청 처리")
    @PatchMapping("/admin/leader-succession-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessLeaderSuccessionRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "ADMIN 강제 LEADER 지정 (LEADER 부재 동아리 한정)")
    @PostMapping("/admin/clubs/{clubId}/leader")
    ResponseEntity<ApiResponse<Void>> assignLeader(
            @PathVariable Long clubId,
            @Valid @RequestBody AssignAdminLeaderRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "동아리 권한 변경 이력 조회")
    @GetMapping("/admin/clubs/{clubId}/member-history")
    ResponseEntity<ApiResponse<PageResponse<ClubMemberHistoryResponse>>> listMemberHistory(
            @PathVariable Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );
}
