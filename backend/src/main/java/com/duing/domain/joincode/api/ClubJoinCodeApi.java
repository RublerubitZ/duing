package com.duing.domain.joincode.api;

import com.duing.domain.joincode.controller.dto.request.CreateJoinCodeRequest;
import com.duing.domain.joincode.controller.dto.response.JoinCodeResponse;
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
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "가입 코드", description = "외부 폼 모집 합격자 등록용 가입 코드 (운영진 전용)")
public interface ClubJoinCodeApi {

    @Operation(summary = "가입 코드 생성 (LEADER/OFFICER)",
            description = "외부 폼(EXTERNAL) 모집에서만 생성할 수 있으며 그 모집에 귀속된다. 모집당 활성 코드는 1개로,"
                    + " 기존 활성 코드가 있으면 자동 폐기되는 재생성이다. 자체 폼 모집이면 409,"
                    + " 모집이 해당 동아리 소속이 아니면 404.")
    @SecurityRequirement(name = "bearerAuth")
    @PostMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes")
    ResponseEntity<ApiResponse<JoinCodeResponse>> createJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @Valid @RequestBody CreateJoinCodeRequest createJoinCodeRequest,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "활성 가입 코드 조회 (LEADER/OFFICER)",
            description = "해당 모집의 폐기되지 않은 코드 1건을 반환한다. 활성 코드가 없으면 200 + data null.")
    @SecurityRequirement(name = "bearerAuth")
    @GetMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/active")
    ResponseEntity<ApiResponse<JoinCodeResponse>> getActiveJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "가입 코드 폐기 (LEADER/OFFICER)",
            description = "이미 폐기된 코드를 다시 폐기해도 성공하며 최초 폐기 시각은 보존된다(멱등).")
    @SecurityRequirement(name = "bearerAuth")
    @DeleteMapping("/clubs/{clubId}/recruitments/{recruitmentId}/join-codes/{joinCodeId}")
    ResponseEntity<Void> revokeJoinCode(
            @PathVariable Long clubId,
            @PathVariable Long recruitmentId,
            @PathVariable Long joinCodeId,
            @Parameter(hidden = true) @AuthenticationPrincipal UserPrincipal currentUser
    );
}
