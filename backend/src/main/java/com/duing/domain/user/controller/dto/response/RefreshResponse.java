package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.service.dto.query.RotationResult;

public record RefreshResponse(
        String accessToken,
        String tokenType,
        String refreshToken
) {
    public static RefreshResponse from(RotationResult rotationResult) {
        return new RefreshResponse(rotationResult.accessToken(), "Bearer", rotationResult.refreshToken());
    }
}
