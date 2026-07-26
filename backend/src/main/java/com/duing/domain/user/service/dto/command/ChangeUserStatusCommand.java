package com.duing.domain.user.service.dto.command;

import com.duing.domain.user.entity.UserStatus;

/** 계정 상태 변경. reason 은 정지·해제 모두 필수다 — 나중에 "왜 풀었는지"가 더 문제가 된다. */
public record ChangeUserStatusCommand(
        Long targetUserId,
        Long actorUserId,
        UserStatus status,
        String reason
) {
}
