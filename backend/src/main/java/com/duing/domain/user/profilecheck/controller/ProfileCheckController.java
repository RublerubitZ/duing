package com.duing.domain.user.profilecheck.controller;

import com.duing.domain.user.profilecheck.api.ProfileCheckApi;
import com.duing.domain.user.profilecheck.controller.dto.request.ConfirmProfileCheckRequest;
import com.duing.domain.user.profilecheck.controller.dto.response.ProfileCheckStatusResponse;
import com.duing.domain.user.profilecheck.service.ProfileCheckService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class ProfileCheckController implements ProfileCheckApi {

    private final ProfileCheckService profileCheckService;

    @Override
    public ResponseEntity<ApiResponse<ProfileCheckStatusResponse>> getProfileCheck(
            @AuthenticationPrincipal UserPrincipal currentUser) {
        ProfileCheckStatusResponse response =
                ProfileCheckStatusResponse.from(profileCheckService.getStatus(currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<Void> confirmProfileCheck(
            @Valid @RequestBody ConfirmProfileCheckRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser) {
        profileCheckService.confirm(request.toCommand(currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
