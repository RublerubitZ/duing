package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.request.CreatePromotionRequest;
import com.duing.domain.promotion.controller.dto.request.UpdatePromotionRequest;
import com.duing.domain.promotion.controller.dto.response.AdminPromotionResponse;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "홍보 배너(총동연)", description = "총동연 전용 Promotion 배너 CRUD")
@SecurityRequirement(name = "BearerAuth")
public interface AdminPromotionApi {

    @Operation(summary = "배너 생성")
    @PostMapping("/admin/promotions")
    ResponseEntity<ApiResponse<Long>> createPromotion(
            @Valid @RequestBody CreatePromotionRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "배너 수정")
    @PatchMapping("/admin/promotions/{promotionId}")
    ResponseEntity<ApiResponse<Void>> updatePromotion(
            @PathVariable Long promotionId,
            @Valid @RequestBody UpdatePromotionRequest request
    );

    @Operation(summary = "배너 삭제")
    @DeleteMapping("/admin/promotions/{promotionId}")
    ResponseEntity<ApiResponse<Void>> deletePromotion(@PathVariable Long promotionId);

    @Operation(summary = "배너 관리 목록")
    @GetMapping("/admin/promotions")
    ResponseEntity<ApiResponse<PageResponse<AdminPromotionResponse>>> listPromotions(
            @RequestParam(required = false) Boolean active,
            @RequestParam(required = false) Long clubId,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "배너 단건 조회", description = "수정 폼 진입 등 단건 조회용. 목록 응답과 동일한 형태로 반환한다.")
    @GetMapping("/admin/promotions/{promotionId}")
    ResponseEntity<ApiResponse<AdminPromotionResponse>> getPromotion(@PathVariable Long promotionId);
}
