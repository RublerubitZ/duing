package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.service.dto.query.UserQuery;

public record UserResponse(
        Long id,
        String studentId,
        String name,
        String email,
        String phone,
        UserRole role
) {
    public static UserResponse from(UserQuery userQuery) {
        return new UserResponse(
                userQuery.id(),
                userQuery.studentId(),
                userQuery.name(),
                userQuery.email(),
                userQuery.phone(),
                userQuery.role()
        );
    }
}
