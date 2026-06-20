package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.ChangePasswordRequest;
import com.duing.domain.user.controller.dto.request.UpdateProfileRequest;
import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "사용자", description = "내 정보 조회 / 수정 / 탈퇴")
public interface UserApi {

    @Operation(summary = "내 정보 조회", description = "현재 인증된 사용자의 정보를 반환한다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me")
    ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "프로필 수정", description = "본인의 이름·전화번호·학년을 수정한다. 학번·이메일은 변경할 수 없다.")
    @SecurityRequirement(name = "BearerAuth")
    @PatchMapping("/users/me")
    ResponseEntity<Void> updateProfile(
            @Valid @RequestBody UpdateProfileRequest updateProfileRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "비밀번호 변경",
            description = "현재 비밀번호 확인 후 새 비밀번호로 변경한다. 변경 후 token_version 을 올려 발급된 "
                    + "모든 토큰을 무효화하므로 재로그인이 필요하다. 현재 비밀번호 불일치·기존과 동일 시 400.")
    @SecurityRequirement(name = "BearerAuth")
    @PatchMapping("/users/me/password")
    ResponseEntity<Void> changePassword(
            @Valid @RequestBody ChangePasswordRequest changePasswordRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    );

    @Operation(summary = "회원 탈퇴",
            description = "현재 인증된 사용자를 탈퇴 처리한다. 계정을 soft delete 하고 token_version 을 올려 발급된 "
                    + "모든 토큰을 즉시 무효화한다. 동아리 회장은 회장직 인계 후에만 탈퇴할 수 있다(409).")
    @SecurityRequirement(name = "BearerAuth")
    @DeleteMapping("/users/me")
    ResponseEntity<Void> withdraw(@AuthenticationPrincipal UserPrincipal currentUser);
}
