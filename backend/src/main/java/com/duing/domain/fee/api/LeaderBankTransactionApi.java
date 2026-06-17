package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.ApproveMatchRequest;
import com.duing.domain.fee.controller.dto.request.SyncBankTransactionsRequest;
import com.duing.domain.fee.controller.dto.response.BankTransactionResponse;
import com.duing.domain.fee.controller.dto.response.SyncResultResponse;
import com.duing.domain.fee.entity.MatchStatus;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "회비 거래 동기화 (운영진)", description = "LEADER/OFFICER BANK 거래 동기화")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderBankTransactionApi {

    @Operation(summary = "BANK 거래 동기화 (LEADER/OFFICER)",
            description = "계좌 비밀번호와 주민등록번호 앞 6자리로 BANK API 를 호출해 기간 내 거래를 멱등 적재한다. "
                    + "인증정보는 API 호출에만 쓰고 저장하지 않는다. 매칭은 후속 단계에서 처리한다.")
    @PostMapping("/leader/clubs/{clubId}/bank-transactions/sync")
    ResponseEntity<ApiResponse<SyncResultResponse>> sync(
            @PathVariable Long clubId,
            @Valid @RequestBody SyncBankTransactionsRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "거래 검토 큐 조회 (LEADER/OFFICER)",
            description = "거래를 매칭 상태별로 페이지 조회한다. PENDING 입금에는 잔액이 입금액과 일치하는 후보 청구를 "
                    + "마감일 오름차순으로 동봉한다.")
    @GetMapping("/leader/clubs/{clubId}/bank-transactions")
    ResponseEntity<ApiResponse<PageResponse<BankTransactionResponse>>> list(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "PENDING") MatchStatus status,
            Pageable pageable,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "거래 승인 — 수동 매칭 (LEADER/OFFICER)",
            description = "PENDING 입금을 후보 청구 1건에 수동 매칭한다. 거래는 MANUAL_MATCHED 로 전이되고 "
                    + "TRANSFER 납부가 생성되며 청구 상태가 재산출된다.")
    @PostMapping("/leader/clubs/{clubId}/bank-transactions/{txId}/approve")
    ResponseEntity<ApiResponse<Void>> approve(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @Valid @RequestBody ApproveMatchRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "거래 무시 (LEADER/OFFICER)",
            description = "PENDING 입금을 회비와 무관한 거래로 표시한다(IGNORED).")
    @PostMapping("/leader/clubs/{clubId}/bank-transactions/{txId}/ignore")
    ResponseEntity<ApiResponse<Void>> ignore(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "거래 매칭취소 (LEADER/OFFICER)",
            description = "이미 매칭된 거래의 매칭을 해제한다. 연결된 납부를 VOID 하고 청구 상태를 복귀시키며 "
                    + "거래를 다시 PENDING 으로 되돌린다.")
    @PostMapping("/leader/clubs/{clubId}/bank-transactions/{txId}/unmatch")
    ResponseEntity<ApiResponse<Void>> unmatch(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
