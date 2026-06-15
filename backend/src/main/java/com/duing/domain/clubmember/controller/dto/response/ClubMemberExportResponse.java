package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import java.time.LocalDateTime;

public record ClubMemberExportResponse(
        Long memberId,
        String name,
        String studentId,
        String major,
        String phone,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberExportResponse from(ClubMemberExportQuery query) {
        return new ClubMemberExportResponse(
                query.memberId(), query.name(), query.studentId(), query.major(),
                query.phone(), query.role(), query.joinedAt()
        );
    }
}
