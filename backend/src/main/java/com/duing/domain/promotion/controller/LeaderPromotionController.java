package com.duing.domain.promotion.controller;

import com.duing.domain.promotion.api.LeaderPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequestRequest;
import com.duing.domain.promotion.service.PromotionRequestService;
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
public class LeaderPromotionController implements LeaderPromotionApi {

    private final PromotionRequestService requestService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createRequest(
            Long clubId,
            CreatePromotionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long requestId = requestService.create(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(requestId));
    }
}
