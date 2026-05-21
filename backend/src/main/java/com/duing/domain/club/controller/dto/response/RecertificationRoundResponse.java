package com.duing.domain.club.controller.dto.response;

import com.duing.domain.club.entity.RecertificationRound;
import com.duing.domain.club.entity.RoundStatus;
import java.time.LocalDateTime;

public record RecertificationRoundResponse(
        Long id,
        int year,
        String label,
        RoundStatus status,
        UserRef openedBy,
        LocalDateTime openedAt,
        UserRef closedBy,
        LocalDateTime closedAt
) {
    public record UserRef(Long id, String name) {}

    public static RecertificationRoundResponse of(
            RecertificationRound round, UserRef openedBy, UserRef closedBy
    ) {
        return new RecertificationRoundResponse(
                round.getId(), round.getYear(), round.getLabel(), round.getStatus(),
                openedBy, round.getOpenedAt(), closedBy, round.getClosedAt()
        );
    }
}
