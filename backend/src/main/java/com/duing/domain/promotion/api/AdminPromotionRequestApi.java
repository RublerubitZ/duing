package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.ProcessPromotionRequestRequest;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestDetailResponse;
import com.duing.domain.promotion.controller.dto.response.PromotionRequestSummaryResponse;
import com.duing.domain.promotion.entity.PromotionRequestStatus;
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

@Tag(name = "홍보 요청(총동연)", description = "총동연 전용 홍보 요청 검토/처리")
@SecurityRequirement(name = "BearerAuth")
public interface AdminPromotionRequestApi {

    @Operation(summary = "홍보 요청 목록")
    @GetMapping("/admin/promotion-requests")
    ResponseEntity<ApiResponse<PageResponse<PromotionRequestSummaryResponse>>> listRequests(
            @RequestParam(required = false) PromotionRequestStatus status,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "홍보 요청 상세")
    @GetMapping("/admin/promotion-requests/{requestId}")
    ResponseEntity<ApiResponse<PromotionRequestDetailResponse>> getRequest(@PathVariable Long requestId);

    @Operation(summary = "홍보 요청 처리")
    @PatchMapping("/admin/promotion-requests/{requestId}")
    ResponseEntity<ApiResponse<Void>> processRequest(
            @PathVariable Long requestId,
            @Valid @RequestBody ProcessPromotionRequestRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
