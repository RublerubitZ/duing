package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;

@Tag(name = "사용자", description = "내 정보 조회")
public interface UserApi {

    @Operation(summary = "내 정보 조회", description = "현재 인증된 사용자의 정보를 반환한다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me")
    ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser);
}
