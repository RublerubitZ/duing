package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.LeaderFeeAccountApi;
import com.duing.domain.fee.controller.dto.request.UpsertFeeAccountRequest;
import com.duing.domain.fee.controller.dto.response.FeeAccountResponse;
import com.duing.domain.fee.service.FeeAccountService;
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
public class LeaderFeeAccountController implements LeaderFeeAccountApi {

    private final FeeAccountService feeAccountService;

    @Override
    public ResponseEntity<ApiResponse<Long>> upsert(
            @PathVariable Long clubId,
            @Valid @RequestBody UpsertFeeAccountRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        // PUT 멱등 upsert — 생성·수정 모두 200 으로 일관 응답하고 계좌 id 를 반환한다.
        Long accountId = feeAccountService.upsert(request.toCommand(clubId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(accountId));
    }

    @Override
    public ResponseEntity<ApiResponse<FeeAccountResponse>> get(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        FeeAccountResponse response = FeeAccountResponse.from(
                feeAccountService.getForManager(clubId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        feeAccountService.delete(clubId, currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
