package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.SyncBankTransactionsRequest;
import com.duing.domain.fee.controller.dto.response.SyncResultResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

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
}
