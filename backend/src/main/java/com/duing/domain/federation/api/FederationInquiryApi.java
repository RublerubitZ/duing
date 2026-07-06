package com.duing.domain.federation.api;

import com.duing.domain.federation.controller.dto.request.CreateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.request.UpdateFederationInquiryRequest;
import com.duing.domain.federation.controller.dto.response.FederationInquiryDetailResponse;
import com.duing.domain.federation.controller.dto.response.FederationInquirySummaryResponse;
import com.duing.domain.federation.entity.FederationInquiryStatus;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.core.io.InputStreamResource;
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

@Tag(name = "총동연 1:1 문의", description = "학생용 비밀문의 API — 작성자와 총동연만 열람")
@SecurityRequirement(name = "BearerAuth")
public interface FederationInquiryApi {

    @Operation(summary = "문의 작성", description = "열린 문의 5건·24시간 10건 초과 시 409. "
            + "attachmentUrls 는 POST /api/v1/files(purpose=FEDERATION_INQUIRY) 로 업로드한 URL 만 허용(최대 5개) — "
            + "그 외 목적의 URL 이면 400.")
    @PostMapping("/federation/inquiries")
    ResponseEntity<ApiResponse<Long>> createInquiry(
            @Valid @RequestBody CreateFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "내 문의 목록")
    @GetMapping("/me/federation-inquiries")
    ResponseEntity<ApiResponse<PageResponse<FederationInquirySummaryResponse>>> listMine(
            @RequestParam(required = false) FederationInquiryStatus status,
            @Parameter(hidden = true) Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 상세", description = "작성자 전용 — 타인 접근은 404(존재 은닉). "
            + "attachments 는 id·파일명·타입·용량만 포함하고 원본 URL·저장 키는 노출하지 않는다(비밀성).")
    @GetMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<FederationInquiryDetailResponse>> getInquiry(
            @PathVariable Long inquiryId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 수정", description = "접수(RECEIVED) 상태에서만 — 답변 작성 시작 후 409. "
            + "attachmentUrls 를 생략하면 기존 첨부 유지, 빈 배열이면 전체 삭제, 값을 담으면 전체 교체(PUT 의미론).")
    @PatchMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<Void>> updateInquiry(
            @PathVariable Long inquiryId,
            @Valid @RequestBody UpdateFederationInquiryRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 삭제", description = "전 상태 허용(soft delete).")
    @DeleteMapping("/federation/inquiries/{inquiryId}")
    ResponseEntity<ApiResponse<Void>> deleteInquiry(
            @PathVariable Long inquiryId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "문의 첨부 다운로드", description = "작성자 본인 또는 ADMIN 만 접근 가능 — 그 외(타 학생·미존재·"
            + "삭제된 문의)는 존재 은닉을 위해 모두 404. 원본 바이트를 그대로 스트리밍하므로 이 응답만 "
            + "ApiResponse 로 감싸지 않는다.")
    @GetMapping("/federation/inquiries/{inquiryId}/attachments/{attachmentId}")
    ResponseEntity<InputStreamResource> downloadAttachment(
            @PathVariable Long inquiryId,
            @PathVariable Long attachmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
