package com.duing.domain.user.api;

import com.duing.domain.user.controller.dto.request.ConfirmEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.SendEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.EmailVerificationResponse;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@Tag(name = "인증", description = "회원가입, 로그인 및 이메일 인증")
public interface AuthApi {

    @Operation(summary = "회원가입", description = "학번/이름/이메일/비밀번호로 STUDENT 계정을 생성한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "생성됨"))
    @PostMapping("/auth/signup")
    ResponseEntity<ApiResponse<Long>> signup(@Valid @RequestBody SignupRequest signupRequest);

    @Operation(summary = "로그인", description = "이메일과 비밀번호로 인증 후 JWT를 발급한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그인 성공"))
    @PostMapping("/auth/login")
    ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "로그아웃",
            description = "현재 사용자의 token_version 을 증가시켜 기존에 발급된 모든 액세스 토큰을 무효화한다.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "로그아웃 성공"))
    @PostMapping("/auth/logout")
    ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal UserPrincipal currentUser);

    @Operation(summary = "이메일 인증코드 발송",
            description = "회원가입용 6자리 인증코드를 학교 이메일로 발송한다. 코드는 20분 유효, 재발송은 60초 쿨다운.")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "발송됨"))
    @PostMapping("/auth/email-verifications")
    ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @Valid @RequestBody SendEmailVerificationRequest sendRequest,
            HttpServletRequest httpServletRequest);

    @Operation(summary = "이메일 인증코드 확인",
            description = "발송된 6자리 코드를 검증한다. 5회 실패 시 무효화. 이미 인증된 경우 200(멱등).")
    @ApiResponses(@io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "인증 성공"))
    @PostMapping("/auth/email-verifications/confirm")
    ResponseEntity<ApiResponse<Void>> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest confirmRequest,
            HttpServletRequest httpServletRequest);
}
