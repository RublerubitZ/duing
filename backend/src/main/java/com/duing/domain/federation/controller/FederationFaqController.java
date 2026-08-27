package com.duing.domain.federation.controller;

import com.duing.domain.federation.api.FederationFaqApi;
import com.duing.domain.federation.controller.dto.request.SubmitFederationFaqFeedbackRequest;
import com.duing.domain.federation.controller.dto.response.FederationFaqCategoryResponse;
import com.duing.domain.federation.controller.dto.response.FederationFaqResponse;
import com.duing.domain.federation.entity.FederationFaq;
import com.duing.domain.federation.entity.FederationFaqCategory;
import com.duing.domain.federation.service.FederationFaqSearchMissRecorder;
import com.duing.domain.federation.service.FederationFaqService;
import com.duing.domain.federation.service.dto.query.FederationFaqSearchCondition;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class FederationFaqController implements FederationFaqApi {

    private final FederationFaqService federationFaqService;
    private final FederationFaqSearchMissRecorder searchMissRecorder;

    @Override
    public ResponseEntity<ApiResponse<PageResponse<FederationFaqResponse>>> getFaqs(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String keyword,
            Pageable pageable,
            HttpServletRequest httpServletRequest
    ) {
        // size 상한은 전역 PageableConfig(100)가 컨트롤러 진입 전에 클램프한다 — 대량 size 요청의 DoS 표면을 줄인다.
        FederationFaqSearchCondition condition = new FederationFaqSearchCondition(categoryId, keyword);
        Page<FederationFaq> faqPage = federationFaqService.searchPublished(condition, pageable);
        // 검색 서비스의 readOnly 트랜잭션이 커넥션을 반납한 뒤(서비스 밖) 기록해 이중 커넥션 점유를
        // 피한다 — 기록 실패는 recorder 내부에서 흡수되므로 이 호출은 응답 흐름에 영향을 주지 않는다.
        searchMissRecorder.recordIfMissed(condition.keyword(), faqPage.getTotalElements(),
                httpServletRequest.getRemoteAddr());
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

    @Override
    public ResponseEntity<ApiResponse<Void>> submitFeedback(
            @PathVariable Long faqId,
            @Valid @RequestBody SubmitFederationFaqFeedbackRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest
    ) {
        // permitAll 경로 — 비로그인이면 currentUser 가 null(AuthenticationPrincipalArgumentResolver 기본 동작).
        Long currentUserId = currentUser != null ? currentUser.id() : null;
        // clientIp 는 익명 제출의 IP 레이트리밋 축 — 프록시 뒤에서는 forward-headers-strategy=native 가
        // 신뢰 프록시의 X-Forwarded-For 만 반영하므로 getRemoteAddr() 이 위조 불가한 유일한 출처다.
        federationFaqService.submitFeedback(
                request.toCommand(faqId, currentUserId, httpServletRequest.getRemoteAddr()));
        return ResponseEntity.noContent().build();
    }

    // 카테고리는 소량(≤10) 전체 테이블이라 전량 Map으로 이름을 해석한다
    // (참조된 id만 배치 조회하는 notice와 달리 테이블 자체가 작음).
    private Map<Long, String> categoryNameMap() {
        return federationFaqService.getCategories().stream()
                .collect(Collectors.toMap(FederationFaqCategory::getId, FederationFaqCategory::getName));
    }
}
