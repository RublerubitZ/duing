package com.duing.domain.clubmember.controller;

import com.duing.domain.clubmember.api.LeaderSuccessionApi;
import com.duing.domain.clubmember.controller.dto.request.CreateLeaderSuccessionRequestRequest;
import com.duing.domain.clubmember.service.LeaderSuccessionService;
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
public class LeaderSuccessionController implements LeaderSuccessionApi {

    private final LeaderSuccessionService successionService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreateLeaderSuccessionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long requestId = successionService.create(
                request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
