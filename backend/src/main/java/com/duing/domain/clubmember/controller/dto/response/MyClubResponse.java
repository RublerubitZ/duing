package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.club.entity.ClubStatus;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.MyClubQuery;
import java.time.LocalDateTime;

public record MyClubResponse(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubStatus status,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
    public static MyClubResponse from(MyClubQuery query) {
        return new MyClubResponse(
                query.clubId(),
                query.clubName(),
                query.logoUrl(),
                query.status(),
                query.myRole(),
                query.activeRecruitmentCount(),
                query.joinedAt()
        );
    }
}
