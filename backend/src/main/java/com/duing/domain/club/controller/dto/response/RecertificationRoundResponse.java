package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import com.duing.domain.club.service.dto.query.RecertificationRoundAdminListQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record RecertificationRoundResponse(
        Long id,
        int year,
        String label,
        RoundStatus status,
        UserRef openedBy,
        Instant openedAt,
        UserRef closedBy,
        Instant closedAt
) {
    public record UserRef(Long id, String name) {}

    public static RecertificationRoundResponse of(
            RecertificationRound round, UserRef openedBy, UserRef closedBy
    ) {
        return new RecertificationRoundResponse(
                round.getId(), round.getYear(), round.getLabel(), round.getStatus(),
                openedBy, TimeMapper.systemWallClockToInstant(round.getOpenedAt()),
                closedBy, TimeMapper.systemWallClockToInstant(round.getClosedAt())
        );
    }

    /** 서비스 계층 Query DTO 로부터 직접 변환한다. */
    public static RecertificationRoundResponse from(RecertificationRoundAdminListQuery query) {
        RecertificationRoundAdminListQuery.UserRef queryOpenedBy = query.openedBy();
        RecertificationRoundAdminListQuery.UserRef queryClosedBy = query.closedBy();
        UserRef openedByRef = new UserRef(queryOpenedBy.id(), queryOpenedBy.name());
        UserRef closedByRef = queryClosedBy == null
                ? null
                : new UserRef(queryClosedBy.id(), queryClosedBy.name());
        return of(query.round(), openedByRef, closedByRef);
    }
}
