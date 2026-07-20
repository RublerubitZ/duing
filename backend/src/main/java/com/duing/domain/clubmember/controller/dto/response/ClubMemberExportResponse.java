package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ClubMemberExportQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record ClubMemberExportResponse(
        Long memberId,
        String name,
        String studentId,
        String major,
        String phone,
        ClubMemberRole role,
        Instant joinedAt
) {
    public static ClubMemberExportResponse from(ClubMemberExportQuery query) {
        return new ClubMemberExportResponse(
                query.memberId(), query.name(), query.studentId(), query.major(),
                query.phone(), query.role(), TimeMapper.systemWallClockToInstant(query.joinedAt())
        );
    }
}
