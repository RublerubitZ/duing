package com.duing.domain.promotion.controller;

import com.duing.domain.promotion.api.AdminPromotionRequestApi;
import com.duing.domain.promotion.controller.dto.request.ProcessPromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestDetailResponse;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestSummaryResponse;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
import com.duing.domain.promotion.service.PromotionRequestService;
import com.duing.domain.promotion.service.dto.query.PromotionRequestAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
public class AdminPromotionRequestController implements AdminPromotionRequestApi {

    private final PromotionRequestService requestService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionRequestSummaryResponse>>> listRequests(
            PromotionRequestStatus status, Long clubId, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                requestService.listForAdmin(new PromotionRequestAdminSearchCondition(status, clubId), pageable)
                        .map(PromotionRequestSummaryResponse::from))));
    }

    @Override
    public ResponseEntity<ApiResponse<PromotionRequestDetailResponse>> getRequest(Long requestId) {
        return ResponseEntity.ok(ApiResponse.success(
                PromotionRequestDetailResponse.from(requestService.getDetailForAdmin(requestId))));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> processRequest(
            Long requestId, @Valid @RequestBody ProcessPromotionRequestRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        requestService.process(request.toCommand(requestId, currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
