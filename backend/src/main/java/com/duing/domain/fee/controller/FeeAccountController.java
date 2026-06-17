package com.duing.domain.fee.controller;

import com.duing.domain.fee.api.FeeAccountApi;
import com.duing.domain.fee.controller.dto.response.FeeAccountResponse;
import com.duing.domain.fee.service.FeeAccountService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FeeAccountController implements FeeAccountApi {

    private final FeeAccountService feeAccountService;

    @Override
    public ResponseEntity<ApiResponse<FeeAccountResponse>> get(
            @PathVariable Long clubId,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        FeeAccountResponse response = FeeAccountResponse.from(
                feeAccountService.getForMember(clubId, currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(response));
    }
}
