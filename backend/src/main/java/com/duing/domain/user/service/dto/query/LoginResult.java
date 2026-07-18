package com.duing.domain.user.service.dto.query;

public record LoginResult(
        String accessToken,
        String refreshToken,
        UserQuery user
) {}
