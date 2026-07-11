package com.duing.domain.user.controller;

import com.duing.domain.user.api.UserApi;
import com.duing.domain.user.controller.dto.request.ChangePasswordRequest;
import com.duing.domain.user.controller.dto.request.ChangePhoneRequest;
import com.duing.domain.user.controller.dto.request.StartPhoneChangeVerificationRequest;
import com.duing.domain.user.controller.dto.request.UpdateProfileRequest;
import com.duing.domain.user.controller.dto.response.PhoneVerificationIssueResponse;
import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.domain.user.service.PhoneVerificationService;
import com.duing.domain.user.service.UserService;
import com.duing.domain.user.service.dto.command.ChangePhoneCommand;
import com.duing.domain.user.service.dto.query.PhoneVerificationIssueResult;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class UserController implements UserApi {

    private final UserService userService;
    private final PhoneVerificationService phoneVerificationService;

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
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        userService.changePassword(changePasswordRequest.toCommand(currentUser.id()));
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
            HttpServletRequest httpServletRequest) {
        String clientIp = httpServletRequest.getRemoteAddr();
        String userAgent = httpServletRequest.getHeader("User-Agent");
        userService.changePhone(
                new ChangePhoneCommand(currentUser.id(), changePhoneRequest.verificationToken()),
                clientIp, userAgent);
        return ResponseEntity.noContent().build();
    }

    @Override
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal UserPrincipal currentUser) {
        userService.withdraw(currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
