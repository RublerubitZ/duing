package com.duing.domain.user.controller;

import com.duing.domain.user.api.AuthApi;
import com.duing.domain.user.controller.dto.request.ConfirmEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.SendEmailVerificationRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.EmailVerificationResponse;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.domain.user.service.EmailVerificationService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.query.EmailVerificationSendResult;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class AuthController implements AuthApi {

    private final UserService userService;
    private final EmailVerificationService emailVerificationService;

    @Override
    public ResponseEntity<ApiResponse<Long>> signup(@Valid @RequestBody SignupRequest signupRequest) {
        Long userId = userService.signup(signupRequest.toCommand());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(userId));
    }

    @Override
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        LoginResponse loginResponse =
                LoginResponse.from(userService.login(loginRequest.toCommand(), clientIp));
        return ResponseEntity.ok(ApiResponse.success(loginResponse));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal UserPrincipal currentUser) {
        userService.logout(currentUser.id());
        return ResponseEntity.ok(ApiResponse.success());
    }

    @Override
    public ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @Valid @RequestBody SendEmailVerificationRequest sendRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        EmailVerificationSendResult sendResult =
                emailVerificationService.sendCode(sendRequest.toCommand(), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(EmailVerificationResponse.from(sendResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> confirmEmailVerification(
            @Valid @RequestBody ConfirmEmailVerificationRequest confirmRequest) {
        emailVerificationService.confirmCode(confirmRequest.toCommand());
        return ResponseEntity.ok(ApiResponse.success());
    }

}
