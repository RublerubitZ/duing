package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.LoginResult;

public record WebLoginResponse(UserResponse user) {
    public static WebLoginResponse from(LoginResult loginResult) {
        return new WebLoginResponse(UserResponse.from(loginResult.user()));
    }
}
