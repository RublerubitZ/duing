package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "사용자", description = "내 정보 조회 / 탈퇴")
public interface UserApi {

    @Operation(summary = "내 정보 조회", description = "현재 인증된 사용자의 정보를 반환한다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me")
    ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "회원 탈퇴",
            description = "현재 인증된 사용자를 탈퇴 처리한다. 계정을 soft delete 하고 token_version 을 올려 발급된 "
                    + "모든 토큰을 즉시 무효화한다. 동아리 회장은 회장직 인계 후에만 탈퇴할 수 있다(409).")
    @SecurityRequirement(name = "BearerAuth")
    @DeleteMapping("/users/me")
    ResponseEntity<Void> withdraw(@AuthenticationPrincipal UserPrincipal currentUser);
}
