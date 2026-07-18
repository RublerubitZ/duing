package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.LoginResult;

public record LoginResponse(
        String accessToken,
        String tokenType,
        String refreshToken,
        UserResponse user
) {
    public static LoginResponse from(LoginResult loginResult) {
        return new LoginResponse(
                loginResult.accessToken(),
                "Bearer",
                loginResult.refreshToken(),
                UserResponse.from(loginResult.user())
        );
    }
}
