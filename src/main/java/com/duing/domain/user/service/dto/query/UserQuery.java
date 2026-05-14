package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;

public record UserQuery(
        Long id,
        String studentId,
        String name,
        String email,
        UserRole role
) {
    public static UserQuery from(User user) {
        return new UserQuery(
                user.getId(),
                user.getStudentId(),
                user.getName(),
                user.getEmail(),
                user.getRole()
        );
    }
}
