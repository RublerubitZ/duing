package com.duing.domain.fee.api;

import com.duing.domain.fee.controller.dto.request.UpsertFeeAccountRequest;
import com.duing.domain.fee.controller.dto.response.FeeAccountResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "회비 계좌 (운영진)", description = "LEADER/OFFICER 회비 계좌 등록·조회·삭제")
@SecurityRequirement(name = "BearerAuth")
public interface LeaderFeeAccountApi {

    @Operation(summary = "회비 계좌 등록·수정 (LEADER/OFFICER)",
            description = "동아리당 계좌 1건. 없으면 생성, 있으면 갱신한다. 계좌번호는 서버가 암호화해 저장한다.")
    @PutMapping("/leader/clubs/{clubId}/fee-account")
    ResponseEntity<ApiResponse<Long>> upsert(
            @PathVariable Long clubId,
            @Valid @RequestBody UpsertFeeAccountRequest request,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 계좌 조회 (LEADER/OFFICER)",
            description = "복호화된 평문 계좌번호를 반환한다. 운영진 편집·확인용.")
    @GetMapping("/leader/clubs/{clubId}/fee-account")
    ResponseEntity<ApiResponse<FeeAccountResponse>> get(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회비 계좌 삭제 (LEADER/OFFICER)")
    @DeleteMapping("/leader/clubs/{clubId}/fee-account")
    ResponseEntity<ApiResponse<Void>> delete(
            @PathVariable Long clubId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
