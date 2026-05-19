package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.User;
import com.duing.domain.user.entity.UserRole;

/**
 * ADMIN 사용자 검색 결과 행. 비밀번호 해시·전화번호 등 민감 필드는 노출하지 않는다.
 */
public record UserSearchResultQuery(
        Long id,
        String studentId,
        String name,
        String email,
        UserRole role
) {
    public static UserSearchResultQuery from(User user) {
        return new UserSearchResultQuery(
                user.getId(),
                user.getStudentId(),
                user.getName(),
                user.getEmail(),
                user.getRole()
        );
    }
}
