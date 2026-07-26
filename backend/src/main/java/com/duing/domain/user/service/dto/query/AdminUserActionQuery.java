package com.duing.domain.user.service.dto.query;

import com.duing.domain.user.entity.AdminUserAction;
import java.time.Instant;

/** 관리자 조치 이력 한 건. actorName 은 감사 로그에 스냅샷하지 않고 users 조인으로 해석한 값이다. */
public record AdminUserActionQuery(
        AdminUserAction action,
        String actorName,
        String reason,
        Instant at
) {
}
