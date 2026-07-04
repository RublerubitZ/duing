package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.CreateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.request.ReorderFederationFaqsRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationFaqResponse;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 FAQ(관리)", description = "총동연 전용 FAQ 관리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFederationFaqApi {

    @Operation(summary = "FAQ 관리 목록", description = "비공개 포함. published/categoryId/keyword 필터.")
    @GetMapping("/admin/federation/faqs")
    ResponseEntity<ApiResponse<PageResponse<AdminFederationFaqResponse>>> getAdminFaqs(
            @RequestParam(required = false) Boolean published,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "FAQ 생성", description = "정렬순서는 맨 뒤 자동 배치.")
    @PostMapping("/admin/federation/faqs")
    ResponseEntity<ApiResponse<Long>> createFaq(
            @Valid @RequestBody CreateFederationFaqRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "FAQ 수정")
    @PatchMapping("/admin/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<Void>> updateFaq(
            @PathVariable Long faqId,
            @Valid @RequestBody UpdateFederationFaqRequest request
    );

    @Operation(summary = "FAQ 삭제 (soft delete)")
    @DeleteMapping("/admin/federation/faqs/{faqId}")
    ResponseEntity<ApiResponse<Void>> deleteFaq(@PathVariable Long faqId);

    @Operation(summary = "FAQ 정렬 전체 교체", description = "orderedIds 순서가 새 정렬. 현재 전체 id 집합과 일치해야 한다.")
    @PutMapping("/admin/federation/faqs/order")
    ResponseEntity<ApiResponse<Void>> reorderFaqs(@Valid @RequestBody ReorderFederationFaqsRequest request);

    @Operation(summary = "FAQ 카테고리 생성", description = "정렬순서는 맨 뒤 자동 배치. 이름 중복 시 409.")
    @PostMapping("/admin/federation/faq-categories")
    ResponseEntity<ApiResponse<Long>> createCategory(
            @Valid @RequestBody CreateFederationFaqCategoryRequest request
    );

    @Operation(summary = "FAQ 카테고리 수정 (이름·정렬순서)")
    @PatchMapping("/admin/federation/faq-categories/{categoryId}")
    ResponseEntity<ApiResponse<Void>> updateCategory(
            @PathVariable Long categoryId,
            @Valid @RequestBody UpdateFederationFaqCategoryRequest request
    );
}
