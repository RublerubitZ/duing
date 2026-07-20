package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

public record MyClubResponse(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubStatus status,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        Instant joinedAt
) {
    public static MyClubResponse from(MyClubQuery query) {
        return new MyClubResponse(
                query.clubId(),
                query.clubName(),
                query.logoUrl(),
                query.status(),
                query.myRole(),
                query.activeRecruitmentCount(),
                TimeMapper.systemWallClockToInstant(query.joinedAt())
        );
    }
}
