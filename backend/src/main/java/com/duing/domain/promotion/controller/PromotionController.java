package com.duing.domain.promotion.controller;

import com.duing.domain.promotion.api.PromotionApi;
import com.duing.domain.promotion.controller.dto.response.PromotionCardResponse;
import com.duing.domain.promotion.service.PromotionService;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class PromotionController implements PromotionApi {

    private final PromotionService promotionService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<PromotionCardResponse>>> listPublic(Pageable pageable) {
        Page<PromotionCardResponse> page = promotionService.findPublicCards(pageable)
                .map(PromotionCardResponse::from);
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(page)));
    }
}
