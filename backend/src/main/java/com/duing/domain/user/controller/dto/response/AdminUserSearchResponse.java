package com.duing.domain.user.controller.dto.response;

import com.duing.domain.user.entity.UserRole;
import com.duing.domain.user.service.dto.query.UserSearchResultQuery;

public record AdminUserSearchResponse(
        Long id,
        String studentId,
        String name,
        UserRole role
) {
    public static AdminUserSearchResponse from(UserSearchResultQuery searchResult) {
        return new AdminUserSearchResponse(
                searchResult.id(),
                searchResult.studentId(),
                searchResult.name(),
                searchResult.role()
        );
    }
}
