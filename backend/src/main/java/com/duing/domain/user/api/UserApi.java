package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.ChangePasswordRequest;
import com.duing.domain.user.controller.dto.request.StartPhoneChangeVerificationRequest;
import com.duing.domain.user.controller.dto.request.UpdateProfileRequest;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;

@Tag(name = "사용자", description = "내 정보 조회 / 수정 / 탈퇴")
public interface UserApi {

    @Operation(summary = "내 정보 조회", description = "현재 인증된 사용자의 정보를 반환한다.")
    @SecurityRequirement(name = "BearerAuth")
    @GetMapping("/users/me")
    ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "프로필 수정", description = "이름·학년을 수정한다. 학년은 생략 시 기존 값을 유지한다. 학번·전화번호는 이 API로 변경할 수 없다(번호 변경은 재인증 필요).")
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

    @Operation(summary = "번호 변경 MO 인증 시작",
            description = "새 번호에 대한 PHONE_CHANGE 인증 세션을 발급한다(본인 JWT 필수). 세션 5분 유효, "
                    + "재발급 60초 쿨다운. 타인이 사용 중인 번호는 409(PHONE_ALREADY_REGISTERED) — 자기 번호 "
                    + "재인증은 허용된다. qr=true 면 SMSTO 딥링크 QR 을 함께 반환한다(실패 시 null).")
    @SecurityRequirement(name = "BearerAuth")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발급됨"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "타인이 사용 중인 번호"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429",
                    description = "재발급 쿨다운(60초) 또는 IP 요청 한도 초과")
    })
    @PostMapping("/users/me/phone-verifications")
    ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> startPhoneChangeVerification(
            @Valid @RequestBody StartPhoneChangeVerificationRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "회원 탈퇴",
            description = "현재 인증된 사용자를 탈퇴 처리한다. 계정을 soft delete 하고 token_version 을 올려 발급된 "
                    + "모든 토큰을 즉시 무효화한다. 동아리 회장은 회장직 인계 후에만 탈퇴할 수 있다(409).")
    @SecurityRequirement(name = "BearerAuth")
    @DeleteMapping("/users/me")
    ResponseEntity<Void> withdraw(@AuthenticationPrincipal UserPrincipal currentUser);
}
