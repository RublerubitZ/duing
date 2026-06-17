package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderBankTransactionApi;
import com.duing.domain.fee.controller.dto.request.SyncBankTransactionsRequest;
import com.duing.domain.fee.controller.dto.response.SyncResultResponse;
import com.duing.domain.fee.service.BankTransactionSyncService;
import com.duing.domain.fee.service.dto.query.SyncResult;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class LeaderBankTransactionController implements LeaderBankTransactionApi {

    private final BankTransactionSyncService bankTransactionSyncService;

    @Override
    public ResponseEntity<ApiResponse<SyncResultResponse>> sync(
            @PathVariable Long clubId,
            @Valid @RequestBody SyncBankTransactionsRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        // 보안: request 본문(계좌 비번·주민번호)은 절대 로깅하지 않는다. 권한·사용가능 검증은 서비스 계층에서 수행한다.
        SyncResult result = bankTransactionSyncService.sync(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(SyncResultResponse.from(result)));
    }
}
