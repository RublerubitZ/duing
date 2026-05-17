package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberQuery;
import java.time.LocalDateTime;

public record ClubMemberResponse(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberResponse from(ClubMemberQuery query) {
        return new ClubMemberResponse(
                query.memberId(), query.userId(), query.name(),
                query.studentId(), query.role(), query.joinedAt()
        );
    }
}
