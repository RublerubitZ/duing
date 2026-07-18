package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import com.duing.domain.clubmember.service.dto.query.ManagedClubQuery;

public record ManagedClubResponse(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        boolean centralClub,
        long activeRecruitmentCount
) {
    public static ManagedClubResponse from(ManagedClubQuery query) {
        return new ManagedClubResponse(
                query.clubId(),
                query.clubName(),
                query.logoUrl(),
                query.myRole(),
                query.centralClub(),
                query.activeRecruitmentCount()
        );
    }
}
