package com.duing.domain.user.controller;

import com.duing.domain.user.api.UserApi;
import com.duing.domain.user.controller.dto.request.ChangePasswordRequest;
import com.duing.domain.user.controller.dto.request.ChangePhoneRequest;
import com.duing.domain.user.controller.dto.request.StartPhoneChangeVerificationRequest;
import com.duing.domain.user.controller.dto.request.UpdateProfileRequest;
import com.duing.domain.user.controller.dto.response.MySessionResponse;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.domain.user.exception.UserException;
import com.duing.domain.user.service.AuthSessionService;
import com.duing.domain.user.service.PhoneVerificationService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
import com.duing.global.auth.AuthTransport;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.auth.WebAuthCookieService;
import com.duing.global.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class UserController implements UserApi {

    private final UserService userService;
    private final AuthSessionService authSessionService;
    private final PhoneVerificationService phoneVerificationService;
    private final WebAuthCookieService webAuthCookieService;

    @Override
    public ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser) {
        UserResponse userResponse = UserResponse.from(userService.getById(currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(userResponse));
    }

    @Override
    public ResponseEntity<Void> updateProfile(
            @Valid @RequestBody UpdateProfileRequest updateProfileRequest,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        userService.updateProfile(updateProfileRequest.toCommand(currentUser.id()));
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> changePassword(
            @Valid @RequestBody ChangePasswordRequest changePasswordRequest,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse
    ) {
        userService.changePassword(changePasswordRequest.toCommand(currentUser.id()));
        clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<PhoneVerificationIssueResponse>> startPhoneChangeVerification(
            @Valid @RequestBody StartPhoneChangeVerificationRequest startRequest,
            @RequestParam(name = "qr", defaultValue = "false") boolean includeQr,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        PhoneVerificationIssueResult issueResult = phoneVerificationService
                .issue(startRequest.toCommand(includeQr, currentUser.id()), clientIp);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(PhoneVerificationIssueResponse.from(issueResult)));
    }

    @Override
    public ResponseEntity<Void> changePhone(
            @Valid @RequestBody ChangePhoneRequest changePhoneRequest,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        userService.changePhone(
                changePhoneRequest.toCommand(currentUser.id()),
                clientIp, userAgent);
        clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> withdraw(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        userService.withdraw(currentUser.id());
        clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<ApiResponse<List<MySessionResponse>>> listMySessions(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        List<MySessionResponse> sessions =
                authSessionService.listSessions(currentUser.id(), currentUser.sessionId()).stream()
                        .map(MySessionResponse::from)
                        .toList();
        return ResponseEntity.ok(ApiResponse.success(sessions));
    }

    @Override
    public ResponseEntity<Void> revokeMySession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        boolean revoked = authSessionService.revokeOne(currentUser.id(), sessionId);
        if (!revoked) {
            throw new UserException.SessionNotFoundException();
        }
        // 현재 세션을 스스로 끊었다면 로그아웃과 동일 — 웹(쿠키) 인증이면 쿠키도 삭제 (spec §8)
        if (sessionId.equals(currentUser.sessionId())) {
            clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        }
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> logoutAllSessions(
            @AuthenticationPrincipal UserPrincipal currentUser,
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        userService.logoutAll(currentUser.id());
        clearWebCookiesWhenCookieAuthenticated(httpServletRequest, httpServletResponse);
        return ResponseEntity.noContent().build();
    }

    private void clearWebCookiesWhenCookieAuthenticated(
            HttpServletRequest httpServletRequest,
            HttpServletResponse httpServletResponse) {
        if (httpServletRequest.getAttribute(AuthTransport.REQUEST_ATTRIBUTE) == AuthTransport.COOKIE) {
            webAuthCookieService.clear(httpServletResponse);
        }
    }
}
