package com.duing.domain.club.controller;

import com.duing.domain.club.api.LeaderRecertificationApi;
import com.duing.domain.club.controller.dto.request.CreateRecertificationRequestRequest;
import com.duing.domain.club.controller.dto.response.RecertificationContextResponse;
import com.duing.domain.club.service.RecertificationRequestService;
import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderRecertificationController implements LeaderRecertificationApi {

    private final RecertificationRequestService requestService;
    private final ClubAuthService clubAuthService;

    @Override
    public ResponseEntity<ApiResponse<RecertificationContextResponse>> getContext(
            Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        RecertificationContextResponse context = requestService.getLeaderContext(clubId);
        return ResponseEntity.ok(ApiResponse.success(context));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreateRecertificationRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        clubAuthService.requireLeader(currentUser.id(), clubId);
        Long requestId = requestService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
