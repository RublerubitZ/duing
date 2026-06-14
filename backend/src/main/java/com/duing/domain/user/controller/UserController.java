package com.duing.domain.user.controller;

import com.duing.domain.user.api.UserApi;
import com.duing.domain.user.controller.dto.response.UserResponse;
import com.duing.domain.user.service.UserService;
import com.duing.global.auth.UserPrincipal;
import com.duing.global.response.ApiResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class UserController implements UserApi {

    private final UserService userService;

    @Override
    public ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal UserPrincipal currentUser) {
        UserResponse userResponse = UserResponse.from(userService.getById(currentUser.id()));
        return ResponseEntity.ok(ApiResponse.success(userResponse));
    }

    @Override
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal UserPrincipal currentUser) {
        userService.withdraw(currentUser.id());
        return ResponseEntity.noContent().build();
    }
}
