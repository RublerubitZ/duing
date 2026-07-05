package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.AnswerFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryAnswerRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryStatusRequest;
import com.duing.domain.federation.controller.dto.response.AdminFederationInquiryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "총동연 1:1 문의(관리)", description = "총동연 전용 문의 처리 API")
@SecurityRequirement(name = "BearerAuth")
public interface AdminFederationInquiryApi {

    @Operation(summary = "문의 관리 목록", description = "status/keyword 필터. 탈퇴 작성자는 '(삭제됨)' 표기.")
    @GetMapping("/admin/federation/inquiries")
    ResponseEntity<ApiResponse<PageResponse<AdminFederationInquiryResponse>>> getInquiries(
            @RequestParam(required = false) FederationInquiryStatus status,
            @RequestParam(required = false) String keyword,
            @Parameter(hidden = true) Pageable pageable
    );

    @Operation(summary = "문의 상세", description = "작성자가 삭제한 문의는 410.")
    @GetMapping("/admin/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<AdminFederationInquiryResponse>> getInquiry(@PathVariable Long inquiryId);

    @Operation(summary = "상태 변경", description = "IN_PROGRESS(답변 작성 CTA — version 필수) 또는 CLOSED(사유 선택).")
    @PatchMapping("/admin/federation/inquiries/{inquiryId}/status")
    ResponseEntity<ApiResponse<Void>> changeStatus(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryStatusRequest request
    );

    @Operation(summary = "답변 등록", description = "ANSWERED 자동 전이 + 작성자 알림. RECEIVED 직행은 version 필수.")
    @PostMapping("/admin/federation/inquiries/{inquiryId}/answer")
    ResponseEntity<ApiResponse<Long>> registerAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody AnswerFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "답변 수정", description = "ANSWERED 상태에서만. 재알림 없음.")
    @PatchMapping("/admin/federation/inquiries/{inquiryId}/answer")
    ResponseEntity<ApiResponse<Void>> updateAnswer(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryAnswerRequest request
    );
}
