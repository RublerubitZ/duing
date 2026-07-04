package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.response.FederationFaqCategoryResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqResponse;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 FAQ", description = "총동아리연합회 FAQ 공개 조회 API (비로그인 접근 가능)")
public interface FederationFaqApi {

    @Operation(summary = "FAQ 목록", description = "공개(published) FAQ만 반환. 정렬: 고정 우선 → 정렬순서 → 최신순.")
    @GetMapping("/federation/faqs")
    ResponseEntity<ApiResponse<PageResponse<FederationFaqResponse>>> getFaqs(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "FAQ 단건", description = "딥링크(/faq?item={id})용. 비공개·삭제 항목은 404.")
    @GetMapping("/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<FederationFaqResponse>> getFaq(@PathVariable Long faqId);

    @Operation(summary = "FAQ 카테고리 목록", description = "정렬순서(sort_order) 오름차순.")
    @GetMapping("/federation/faq-categories")
    ResponseEntity<ApiResponse<List<FederationFaqCategoryResponse>>> getCategories();
}
