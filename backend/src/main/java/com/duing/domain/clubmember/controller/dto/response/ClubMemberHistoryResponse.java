package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberEventType;
import com.duing.domain.clubmember.entity.ClubMemberHistory;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberHistoryAdminQuery;
import java.time.LocalDateTime;

public record ClubMemberHistoryResponse(
        Long id,
        ClubMemberEventType eventType,
        UserRef target,
        UserRef actor,
        ClubMemberRole fromRole,
        ClubMemberRole toRole,
        String reason,
        LocalDateTime createdAt
) {
    public record UserRef(Long id, String name) {}

    public static ClubMemberHistoryResponse of(
            ClubMemberHistory history, UserRef target, UserRef actor
    ) {
        return new ClubMemberHistoryResponse(
                history.getId(), history.getEventType(), target, actor,
                history.getFromRole(), history.getToRole(),
                history.getReason(), history.getCreatedAt()
        );
    }

    public static ClubMemberHistoryResponse from(ClubMemberHistoryAdminQuery query) {
        UserRef target = new UserRef(query.target().id(), query.target().name());
        UserRef actor = new UserRef(query.actor().id(), query.actor().name());
        return new ClubMemberHistoryResponse(
                query.id(), query.eventType(), target, actor,
                query.fromRole(), query.toRole(),
                query.reason(), query.createdAt()
        );
    }
}
