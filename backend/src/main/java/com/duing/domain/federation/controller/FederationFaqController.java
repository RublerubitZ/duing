package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationFaqApi;
import com.duing.domain.federation.controller.dto.response.FederationFaqCategoryResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqResponse;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.FederationFaqService;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FederationFaqController implements FederationFaqApi {

    private static final int MAX_PAGE_SIZE = 100;

    private final FederationFaqService federationFaqService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationFaqResponse>>> getFaqs(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            Pageable pageable
    ) {
        // 비로그인 공개 API — Spring Data 기본 상한(2000)보다 좁게 잠가 대량 size 요청의 DoS 표면을 줄인다.
        Pageable cappedPageable = pageable.getPageSize() > MAX_PAGE_SIZE
                ? PageRequest.of(pageable.getPageNumber(), MAX_PAGE_SIZE, pageable.getSort())
                : pageable;
        FederationFaqSearchCondition condition = new FederationFaqSearchCondition(categoryId, keyword);
        Page<FederationFaq> faqPage = federationFaqService.searchPublished(condition, cappedPageable);
        Map<Long, String> categoryNames = faqPage.isEmpty() ? Map.of() : categoryNameMap();
        Page<FederationFaqResponse> responsePage = faqPage.map(
                faq -> FederationFaqResponse.from(faq, categoryNames.get(faq.getCategoryId())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(responsePage)));
    }

    @Override
    public ResponseEntity<ApiResponse<FederationFaqResponse>> getFaq(@PathVariable Long faqId) {
        FederationFaq faq = federationFaqService.getPublished(faqId);
        return ResponseEntity.ok(ApiResponse.success(
                FederationFaqResponse.from(faq, federationFaqService.getCategoryName(faq.getCategoryId()))));
    }

    @Override
    public ResponseEntity<ApiResponse<List<FederationFaqCategoryResponse>>> getCategories() {
        List<FederationFaqCategoryResponse> categories = federationFaqService.getCategories().stream()
                .map(FederationFaqCategoryResponse::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(categories));
    }

    // 카테고리는 소량(≤10) 전체 테이블이라 전량 Map으로 이름을 해석한다
    // (참조된 id만 배치 조회하는 notice와 달리 테이블 자체가 작음).
    private Map<Long, String> categoryNameMap() {
        return federationFaqService.getCategories().stream()
                .collect(Collectors.toMap(FederationFaqCategory::getId, FederationFaqCategory::getName));
    }
}
