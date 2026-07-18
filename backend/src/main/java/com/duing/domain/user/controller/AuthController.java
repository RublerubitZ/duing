package com.duing.domain.user.controller;

import com.duing.domain.user.api.AuthApi;
import com.duing.domain.user.controller.dto.request.CompletePasswordResetRequest;
import com.duing.domain.user.controller.dto.request.IssuePhoneVerificationRequest;
import com.duing.domain.user.controller.dto.request.LoginRequest;
import com.duing.domain.user.controller.dto.request.PasswordResetStartRequest;
import com.duing.domain.user.controller.dto.request.PhoneVerificationStatusRequest;
import com.duing.domain.user.controller.dto.request.SignupRequest;
import com.duing.domain.user.controller.dto.response.LoginResponse;
import com.duing.domain.user.controller.dto.response.PasswordResetStartResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationStatusResponse;
import com.duing.domain.user.controller.dto.response.WebLoginResponse;
import com.duing.domain.user.entity.SessionPlatform;
import com.duing.domain.user.service.PhoneVerificationService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.LoginContext;
import com.duing.domain.user.service.dto.query.LoginResult;
import com.duing.domain.user.service.dto.query.PasswordResetStartResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.domain.user.service.dto.query.PhoneVerificationStatusResult;
import com.duing.global.auth.DeviceLabelParser;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.auth.WebAuthCookieService;
import com.duing.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class AuthController implements AuthApi {

    private final UserService userService;
    private final PhoneVerificationService phoneVerificationService;
    private final WebAuthCookieService webAuthCookieService;

    @Override
    public ResponseEntity<ApiResponse<Long>> signup(
            @Valid @RequestBody SignupRequest signupRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        Long userId = userService.signup(signupRequest.toCommand(), clientIp, userAgent);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(userId));
    }

    @Override
    public ResponseEntity<ApiResponse<LoginResponse>> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        LoginContext loginContext = new LoginContext(clientIp, userAgent,
                SessionPlatform.from(loginRequest.platform()),
                loginRequest.deviceLabel() != null ? loginRequest.deviceLabel()
                        : DeviceLabelParser.summarize(userAgent),
                false);
        LoginResponse loginResponse =
                LoginResponse.from(userService.login(loginRequest.toCommand(), loginContext));
        return ResponseEntity.ok(ApiResponse.success(loginResponse));
    }

    @Override
    public ResponseEntity<ApiResponse<WebLoginResponse>> webLogin(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        boolean rememberMe = loginRequest.rememberMeOrDefault();
        LoginContext loginContext = new LoginContext(clientIp, userAgent, SessionPlatform.WEB,
                DeviceLabelParser.summarize(userAgent), rememberMe);
        LoginResult loginResult = userService.login(loginRequest.toCommand(), loginContext);
        webAuthCookieService.issue(
                httpServletRequest,
                httpServletResponse,
                loginResult.accessToken(),
                loginResult.refreshToken(),
                loginResult.user().role().name(),
                rememberMe);
        return ResponseEntity.ok(ApiResponse.success(WebLoginResponse.from(loginResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<Void>> logout(@AuthenticationPrincipal UserPrincipal currentUser) {
        userService.logout(currentUser.id());
        return ResponseEntity.ok(ApiResponse.success());
    }

    @Override
    public ResponseEntity<Void> webLogout(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletResponse httpServletResponse) {
        try {
            if (currentUser != null) {
                userService.logout(currentUser.id());
            }
            return ResponseEntity.noContent().build();
        } finally {
            webAuthCookieService.clear(httpServletResponse);
        }
    }

    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> issuePhoneVerification(
            @Valid @RequestBody IssuePhoneVerificationRequest issueRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PhoneVerificationIssueResult issueResult =
                phoneVerificationService.issue(issueRequest.toCommand(includeQr), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(PhoneVerificationIssueResponse.from(issueResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationStatusResponse>> getPhoneVerificationStatus(
            @Valid @RequestBody PhoneVerificationStatusRequest statusRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        PhoneVerificationStatusResult statusResult =
                phoneVerificationService.getStatus(statusRequest.verificationToken(), clientIp, userAgent);
        return ResponseEntity.ok(ApiResponse.success(PhoneVerificationStatusResponse.from(statusResult)));
    }

    @Override
    public ResponseEntity<ApiResponse<PasswordResetStartResponse>> startPasswordReset(
            @Valid @RequestBody PasswordResetStartRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PasswordResetStartResult startResult = phoneVerificationService
                .startPasswordReset(startRequest.studentId(), includeQr, clientIp);
        return ResponseEntity.status(HttpStatus.ACCEPTED)
                .body(ApiResponse.success(PasswordResetStartResponse.from(startResult)));
    }

    @Override
    public ResponseEntity<Void> completePasswordReset(
            @Valid @RequestBody CompletePasswordResetRequest completeRequest,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        userService.resetPassword(completeRequest.toCommand(), clientIp, userAgent);
        return ResponseEntity.noContent().build();
    }

}
