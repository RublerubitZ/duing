package com.duing.domain.promotion.api;

import com.duing.domain.promotion.controller.dto.response.PromotionCardResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "홍보 배너", description = "공개 Promotion 배너 캐러셀 (비로그인 포함)")
public interface PromotionApi {

    @Operation(summary = "공개 활성 배너 목록 (비로그인)")
    @GetMapping("/promotions")
    ResponseEntity<ApiResponse<PageResponse<PromotionCardResponse>>> listPublic(
            @Parameter(hidden = true) Pageable pageable
    );
}
