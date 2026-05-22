package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.AdminLeaderSuccessionApi;
import com.duing.domain.clubmember.controller.dto.request.AssignAdminLeaderRequest;
import com.duing.domain.clubmember.controller.dto.request.ProcessLeaderSuccessionRequest;
import com.duing.domain.clubmember.controller.dto.response.ClubMemberHistoryResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestDetailResponse;
import com.duing.domain.clubmember.controller.dto.response.SuccessionRequestSummaryResponse;
import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.AdminLeaderAssignmentService;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
import com.duing.domain.clubmember.service.dto.query.SuccessionAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminLeaderSuccessionController implements AdminLeaderSuccessionApi {

    private final LeaderSuccessionService successionService;
    private final AdminLeaderAssignmentService leaderAssignmentService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<SuccessionRequestSummaryResponse>>> listRequests(
            SuccessionStatus status, Long clubId, Pageable pageable
    ) {
        Page<SuccessionRequestSummaryResponse> page = successionService
                .listForAdmin(new SuccessionAdminSearchCondition(status, clubId), pageable)
                .map(SuccessionRequestSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<SuccessionRequestDetailResponse>> getRequest(Long requestId) {
        SuccessionRequestDetailResponse response =
                SuccessionRequestDetailResponse.from(successionService.getDetailForAdmin(requestId));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, @Valid @RequestBody ProcessLeaderSuccessionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        successionService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> assignLeader(
            Long clubId, @Valid @RequestBody AssignAdminLeaderRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        leaderAssignmentService.assign(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<ClubMemberHistoryResponse>>> listMemberHistory(
            Long clubId, Pageable pageable
    ) {
        Page<ClubMemberHistoryResponse> page = successionService
                .listMemberHistoryForAdmin(clubId, pageable)
                .map(ClubMemberHistoryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}
