package com.duing.domain.user.profilecheck.controller;

import com.duing.domain.user.profilecheck.api.AdminProfileCheckApi;
import com.duing.domain.user.profilecheck.controller.dto.request.UpdateProfileCheckSettingRequest;
import com.duing.domain.user.profilecheck.controller.dto.response.AdminProfileCheckResponse;
import com.duing.domain.user.profilecheck.service.AdminProfileCheckService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminProfileCheckController implements AdminProfileCheckApi {

    private final AdminProfileCheckService adminProfileCheckService;

    @Override
    public ResponseEntity<ApiResponse<AdminProfileCheckResponse>> getProfileCheck() {
        AdminProfileCheckResponse response = AdminProfileCheckResponse.from(adminProfileCheckService.get());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Override
    public ResponseEntity<Void> updateProfileCheck(
            @Valid @RequestBody UpdateProfileCheckSettingRequest request,
            @AuthenticationPrincipal UserPrincipal currentUser
    ) {
        adminProfileCheckService.update(request.toCommand(currentUser.id()));
        return ResponseEntity.noContent().build();
    }
}
