package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.SuccessionStatus;
import com.duing.domain.clubmember.service.dto.query.SuccessionRequestMyLatestQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/** 요청자 본인의 최근 승계 요청 — 처리자(handledBy)·현 회장은 내보내지 않는다. */
public record MyLatestSuccessionRequestResponse(
        Long requestId,
        SuccessionStatus status,
        String reason,
        String actionNote,
        Instant createdAt,
        Instant handledAt
) {
    public static MyLatestSuccessionRequestResponse from(SuccessionRequestMyLatestQuery query) {
        return new MyLatestSuccessionRequestResponse(
                query.requestId(), query.status(), query.reason(), query.actionNote(),
                TimeMapper.systemWallClockToInstant(query.createdAt()),
                TimeMapper.systemWallClockToInstant(query.handledAt()));
    }
}
