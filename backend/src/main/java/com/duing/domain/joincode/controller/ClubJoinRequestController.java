package com.duing.domain.joincode.controller;

import com.duing.domain.joincode.api.ClubJoinRequestApi;
import com.duing.domain.joincode.controller.dto.response.JoinRequestDetailResponse;
import com.duing.domain.joincode.controller.dto.response.JoinRequestSummaryResponse;
import com.duing.domain.joincode.entity.JoinRequestStatus;
import com.duing.domain.joincode.service.JoinRequestService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ClubJoinRequestController implements ClubJoinRequestApi {

    private final JoinRequestService joinRequestService;

    @Override
    public ResponseEntity<ApiResponse<List<JoinRequestSummaryResponse>>> getJoinRequests(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "PENDING") JoinRequestStatus status,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        List<JoinRequestSummaryResponse> joinRequests =
                joinRequestService.getRequests(clubId, currentUser.id(), status).stream()
                        .map(JoinRequestSummaryResponse::from)
                        .toList();
        return ResponseEntity.ok(ApiResponse.success(joinRequests));
    }

    @Override
    public ResponseEntity<ApiResponse<JoinRequestDetailResponse>> getJoinRequest(
            @PathVariable Long clubId,
            @PathVariable Long joinRequestId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        JoinRequestDetailResponse joinRequest = JoinRequestDetailResponse.from(
                joinRequestService.getRequest(clubId, joinRequestId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(joinRequest));
    }
}
