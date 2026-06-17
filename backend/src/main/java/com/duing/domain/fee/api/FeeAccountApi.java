package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.response.FeeAccountResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Tag(name = "회비 계좌 (동아리원)", description = "동아리원 회비 입금 계좌 조회")
@SecurityRequirement(name = "BearerAuth")
public interface FeeAccountApi {

    @Operation(summary = "회비 입금 계좌 조회 (동아리원)",
            description = "동아리원이 입금에 필요한 계좌(은행·계좌번호·예금주)를 복호화된 평문으로 조회한다.")
    @GetMapping("/clubs/{clubId}/fee-account")
    ResponseEntity<ApiResponse<FeeAccountResponse>> get(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
