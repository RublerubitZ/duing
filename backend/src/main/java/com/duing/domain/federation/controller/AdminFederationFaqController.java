package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.AdminFederationFaqApi;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.request.ReorderFederationFaqsRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationFaqResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqSearchMissResponse;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.entity.FederationFaqSearchMiss;
import com.duing.domain.federation.service.FederationFaqService;
import com.duing.domain.federation.service.dto.command.DeleteFederationFaqCategoryCommand;
import com.duing.domain.federation.service.dto.query.FederationFaqAdminSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminFederationFaqController implements AdminFederationFaqApi {

    private final FederationFaqService federationFaqService;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<AdminFederationFaqResponse>>> getAdminFaqs(
            @RequestParam(required = false) Boolean published,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            Pageable pageable
    ) {
        FederationFaqAdminSearchCondition condition =
                new FederationFaqAdminSearchCondition(published, categoryId, keyword);
        Page<FederationFaq> faqPage = federationFaqService.searchForAdmin(condition, pageable);
        Map<Long, String> categoryNames = faqPage.isEmpty() ? Map.of() : categoryNameMap();
        // 목록 1쿼리 + 페이지에 담긴 faqId만 IN 집계 1쿼리 — 페이지 크기 한정이라 N+1 없이 안전하다.
        Map<Long, Map<Boolean, Long>> feedbackCountsByFaqId = federationFaqService.getFeedbackCounts(
                faqPage.getContent().stream().map(FederationFaq::getId).toList());
        Page<AdminFederationFaqResponse> responsePage = faqPage.map(
                faq -> AdminFederationFaqResponse.from(faq, categoryNames.get(faq.getCategoryId()),
                        feedbackCountsByFaqId.getOrDefault(faq.getId(), Map.of())));
        return ResponseEntity.ok(ApiResponse.success(PageResponse.from(responsePage)));
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createFaq(
            @Valid @RequestBody CreateFederationFaqRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        Long faqId = federationFaqService.create(request.toCommand(currentUser.id()));
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(faqId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateFaq(
            @PathVariable Long faqId, @Valid @RequestBody UpdateFederationFaqRequest request) {
        federationFaqService.update(request.toCommand(faqId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteFaq(@PathVariable Long faqId) {
        federationFaqService.delete(faqId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> reorderFaqs(@Valid @RequestBody ReorderFederationFaqsRequest request) {
        federationFaqService.reorder(request.toCommand());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Long>> createCategory(
            @Valid @RequestBody CreateFederationFaqCategoryRequest request) {
        Long createdCategoryId = federationFaqService.createCategory(request.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(createdCategoryId));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> updateCategory(
            @PathVariable Long categoryId, @Valid @RequestBody UpdateFederationFaqCategoryRequest request) {
        federationFaqService.updateCategory(request.toCommand(categoryId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> deleteCategory(
            @PathVariable Long categoryId, @RequestParam(required = false) Long moveToCategoryId) {
        federationFaqService.deleteCategory(new DeleteFederationFaqCategoryCommand(categoryId, moveToCategoryId));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationFaqSearchMissResponse>>> getSearchMisses(
            Pageable pageable
    ) {
        Page<FederationFaqSearchMiss> searchMissPage = federationFaqService.getSearchMisses(pageable);
        return ResponseEntity.ok(ApiResponse.success(
                PageResponse.from(searchMissPage.map(FederationFaqSearchMissResponse::from))));
    }

    // 카테고리는 소량(≤10) 전체 테이블이라 전량 Map으로 이름을 해석한다 (FederationFaqController와 동일 전략).
    private Map<Long, String> categoryNameMap() {
        return federationFaqService.getCategories().stream()
                .collect(Collectors.toMap(FederationFaqCategory::getId, FederationFaqCategory::getName));
    }
}
