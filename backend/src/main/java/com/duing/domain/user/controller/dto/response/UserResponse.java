package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.College;
import com.duing.domain.user.entity.Grade;
import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.service.dto.query.UserQuery;

public record UserResponse(
        Long id,
        String studentId,
        String name,
        String phone,
        UserRole role,
        Grade grade,
        College college,
        String major
) {
    public static UserResponse from(UserQuery userQuery) {
        return new UserResponse(
                userQuery.id(),
                userQuery.studentId(),
                userQuery.name(),
                userQuery.phone(),
                userQuery.role(),
                userQuery.grade(),
                userQuery.college(),
                userQuery.major()
        );
    }
}
