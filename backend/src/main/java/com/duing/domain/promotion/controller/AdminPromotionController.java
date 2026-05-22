package com.duing.domain.promotion.controller;

import com.duing.domain.promotion.api.AdminPromotionApi;
import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.domain.promotion.service.dto.query.PromotionAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
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
public class AdminPromotionController implements AdminPromotionApi {

    private final PromotionService promotionService;

    @Override
    public ResponseEntity<ApiResponse<Long>> createPromotion(
            @Valid @RequestBody CreatePromotionRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long id = promotionService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(id));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updatePromotion(
            Long promotionId, @Valid @RequestBody UpdatePromotionRequest request
    ) {
        promotionService.update(request.toCommand(promotionId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deletePromotion(Long promotionId) {
        promotionService.delete(promotionId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(
            Boolean active, Long clubId, Pageable pageable
    ) {
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(
                promotionService.listForAdmin(new PromotionAdminSearchCondition(active, clubId), pageable)
                        .map(AdminPromotionResponse::from))));
    }
}
