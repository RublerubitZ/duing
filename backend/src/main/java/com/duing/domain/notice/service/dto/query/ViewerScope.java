package com.duing.domain.notice.service.dto.query;

import com.duing.domain.user.entity.UserRole;
import java.util.Set;

public record ViewerScope(
        UserRole role,
        Long userId,
        Set<Long> memberClubIds,
        Set<Long> officerClubIds
) {
    public static ViewerScope anonymous() {
        return new ViewerScope(null, null, Set.of(), Set.of());
    }
    public boolean isAdmin() { return role == UserRole.ADMIN; }
    public boolean isAnonymous() { return role == null; }
}
