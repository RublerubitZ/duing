package com.duing.domain.club.controller;

import com.duing.domain.club.api.AdminClubApi;
import com.duing.domain.club.controller.dto.request.AdminUpdateClubRequest;
import com.duing.domain.club.controller.dto.request.CloseClubRequest;
import com.duing.domain.club.controller.dto.request.CreateClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubCentralClubRequest;
import com.duing.domain.club.controller.dto.request.UpdateClubStatusRequest;
import com.duing.domain.club.controller.dto.response.AdminClubSummaryResponse;
import com.duing.domain.club.controller.dto.response.ClubDetailResponse;
import com.duing.domain.club.entity.ClubCategory;
import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.club.service.ClubClosureService;
import com.duing.domain.club.service.ClubService;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubViewer;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminClubController implements AdminClubApi {

    private final ClubService clubService;
    private final ClubClosureService clubClosureService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminClubSummaryResponse>>> getAdminClubs(
            @RequestParam(required = false) ClubStatus status,
            @RequestParam(required = false) ClubCategory category,
            @RequestParam(required = false) String division,
            @RequestParam(required = false) String keyword,
            Pageable pageable
    ) {
        AdminClubSearchCondition condition = new AdminClubSearchCondition(status, category, division, keyword);
        Page<AdminClubSummaryResponse> page = clubService.searchForAdmin(condition, pageable)
                .map(AdminClubSummaryResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> getAdminClub(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        ClubDetailResponse response = ClubDetailResponse.from(
                clubService.getById(clubId, new ClubViewer(currentUser.id(), true)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<ClubDetailResponse>> updateClub(
            @PathVariable Long clubId,
            @Valid @RequestBody AdminUpdateClubRequest adminUpdateClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.updateAsAdmin(adminUpdateClubRequest.toCommand(clubId, currentUser.id()));
        ClubDetailResponse response = ClubDetailResponse.from(
                clubService.getById(clubId, new ClubViewer(currentUser.id(), true)));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createClub(@Valid @RequestBody CreateClubRequest createClubRequest) {
        Long clubId = clubService.create(createClubRequest.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(clubId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateClubStatus(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubStatusRequest updateClubStatusRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubService.updateStatus(updateClubStatusRequest.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateClubCentralClub(
            @PathVariable Long clubId,
            @Valid @RequestBody UpdateClubCentralClubRequest updateClubCentralClubRequest
    ) {
        clubService.updateCentralClub(updateClubCentralClubRequest.toCommand(clubId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> closeClub(
            @PathVariable Long clubId,
            @Valid @RequestBody(required = false) CloseClubRequest closeClubRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        CloseClubRequest body = closeClubRequest != null ? closeClubRequest : new CloseClubRequest(null);
        clubClosureService.close(body.toCommand(clubId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
