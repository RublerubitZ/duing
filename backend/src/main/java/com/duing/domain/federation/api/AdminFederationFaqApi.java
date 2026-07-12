package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.CreateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.CreateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.request.ReorderFederationFaqsRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqCategoryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationFaqRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationFaqResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqSearchMissResponse;
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

    @Operation(summary = "FAQ 관리 목록", description = "비공개 포함. published/categoryId/keyword 필터. "
            + "각 FAQ에 \"도움됨\" 피드백 집계(helpfulCount/notHelpfulCount)를 포함한다 — 학생 공개 표면에는 노출되지 않는 admin 전용 정보.")
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

    @Operation(summary = "FAQ 카테고리 삭제", description = "카테고리가 비어 있으면 즉시 soft delete(204). "
            + "moveToCategoryId를 지정하면 소속 FAQ를 전부 그 카테고리로 이관한 후 삭제한다. "
            + "FAQ가 남아 있는데 moveToCategoryId를 지정하지 않으면 409. "
            + "moveToCategoryId를 삭제하려는 카테고리와 같게 지정하면 400. "
            + "삭제하려는 카테고리 또는 moveToCategoryId 카테고리가 존재하지 않으면 404.")
    @DeleteMapping("/admin/federation/faq-categories/{categoryId}")
    ResponseEntity<ApiResponse<Void>> deleteCategory(
            @PathVariable Long categoryId,
            @RequestParam(required = false) Long moveToCategoryId
    );

    @Operation(summary = "무결과 검색어 목록", description = "공개 FAQ 검색(GET /federation/faqs?keyword=)에서 결과 0건이었던 "
            + "정규화 키워드의 집계다. 정렬은 miss_count 내림차순·last_searched_at 내림차순으로 서버가 고정하며 정렬 파라미터는 "
            + "지원하지 않는다. \"학생이 찾는데 없는 FAQ\"를 발견하는 admin 전용 갭 신호.")
    @GetMapping("/admin/federation/faq-search-misses")
    ResponseEntity<ApiResponse<PageResponse<FederationFaqSearchMissResponse>>> getSearchMisses(
            @Parameter(hidden = true) Pageable pageable
    );
}
