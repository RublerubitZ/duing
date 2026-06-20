package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderBankTransactionApi;
import com.duing.domain.fee.controller.dto.request.ApproveMatchRequest;
import com.duing.domain.fee.controller.dto.request.SyncBankTransactionsRequest;
import com.duing.domain.fee.controller.dto.response.BankMatchingStatusResponse;
import com.duing.domain.fee.controller.dto.response.BankTransactionResponse;
import com.duing.domain.fee.controller.dto.response.SyncResultResponse;
import com.duing.domain.fee.entity.MatchStatus;
import com.duing.domain.fee.service.BankTransactionReviewService;
import com.duing.domain.fee.service.BankTransactionSyncService;
import com.duing.domain.fee.service.dto.query.SyncResult;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import com.duing.global.response.PageResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
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
@PreAuthorize("isAuthenticated()")
public class LeaderBankTransactionController implements LeaderBankTransactionApi {

    private final BankTransactionSyncService bankTransactionSyncService;
    private final BankTransactionReviewService bankTransactionReviewService;

    @Override
    public ResponseEntity<ApiResponse<BankMatchingStatusResponse>> matchingStatus(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        boolean enabled = bankTransactionReviewService.isMatchingEnabled(clubId, currentUser.id());
        return ResponseEntity.ok(ApiResponse.success(BankMatchingStatusResponse.of(enabled)));
    }

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

    @Override
    public ResponseEntity<ApiResponse<PageResponse<BankTransactionResponse>>> list(
            @PathVariable Long clubId,
            @RequestParam(defaultValue = "PENDING") MatchStatus status,
            Pageable pageable,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        PageResponse<BankTransactionResponse> page = PageResponse.from(
                bankTransactionReviewService.list(clubId, currentUser.id(), status, pageable)
                        .map(BankTransactionResponse::from));
        return ResponseEntity.ok(ApiResponse.success(page));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> approve(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @Valid @RequestBody ApproveMatchRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        bankTransactionReviewService.approve(clubId, currentUser.id(), txId, request.feeBillId());
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> ignore(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        bankTransactionReviewService.ignore(clubId, currentUser.id(), txId);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> unmatch(
            @PathVariable Long clubId,
            @PathVariable Long txId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        bankTransactionReviewService.unmatch(clubId, currentUser.id(), txId);
        return ResponseEntity.noContent().build();
    }
}
