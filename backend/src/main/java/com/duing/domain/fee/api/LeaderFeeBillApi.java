package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.GenerateBillsRequest;
import com.duing.domain.fee.controller.dto.response.FeeBillResponse;
import com.duing.domain.fee.controller.dto.response.GenerateBillsResponse;
import com.duing.domain.fee.controller.dto.response.ReceiptResponse;
import com.duing.domain.fee.entity.FeeStatus;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회비 청구 (운영진)", description = "LEADER/OFFICER 회비 청구 발행·취소")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderFeeBillApi {

    @Operation(summary = "회비 청구 일괄 발행 (LEADER/OFFICER, 멱등)")
    @PostMapping("/leader/clubs/{clubId}/fee-policies/{policyId}/bills")
    ResponseEntity<ApiResponse<GenerateBillsResponse>> generate(
            @PathVariable Long clubId,
            @PathVariable Long policyId,
            @Valid @RequestBody GenerateBillsRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 청구 현황 조회 (LEADER/OFFICER)",
            description = "동아리 청구 현황을 회차·상태·회원 동적 필터와 페이지네이션으로 조회한다. "
                    + "응답의 status 는 저장 상태이고, 화면 표기와 status 필터는 조회 시점 기준 표기 축"
                    + "(displayStatus 시멘틱)이다 — 마감이 지난 저장 PENDING 은 status=OVERDUE 로 걸러진다.")
    @GetMapping("/leader/clubs/{clubId}/fee-bills")
    ResponseEntity<ApiResponse<PageResponse<FeeBillResponse>>> getBills(
            @PathVariable Long clubId,
            @RequestParam(required = false) String billingPeriod,
            @RequestParam(required = false) FeeStatus status,
            @RequestParam(required = false) Long userId,
            Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 청구 취소 (LEADER/OFFICER)")
    @DeleteMapping("/leader/clubs/{clubId}/fee-bills/{billId}")
    ResponseEntity<ApiResponse<Void>> cancel(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 영수증 조회 (LEADER/OFFICER)",
            description = "동아리 청구의 영수증 데이터를 반환한다. ACTIVE 납부가 없거나 취소된 청구는 404, 타 동아리 청구도 404. "
                    + "status 는 저장 상태(레코드 보존용)이고 화면 표기는 조회 시점 기준 표기 축인 displayStatus 를 쓴다.")
    @GetMapping("/leader/clubs/{clubId}/fee-bills/{billId}/receipt")
    ResponseEntity<ApiResponse<ReceiptResponse>> getReceipt(
            @PathVariable Long clubId,
            @PathVariable Long billId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
