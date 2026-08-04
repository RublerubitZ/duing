package com.duing.domain.joincode.service.dto.command;

import com.duing.domain.joincode.entity.JoinRequestStatus;

/** 가입 요청 단건 처리(승인/거절). {@code status} 는 APPROVED 또는 REJECTED 만 허용된다. */
public record DecideJoinRequestCommand(
        Long clubId,
        Long joinRequestId,
        Long requesterId,
        JoinRequestStatus status
) {
}
