package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;

/**
 * 운영진(LEADER/OFFICER) 인 사용자가 관리 가능한 동아리 단건.
 * 콘솔 진입 시 셀렉터·가드 판정에 사용된다.
 */
public record ManagedClubQuery(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        boolean centralClub,
        long activeRecruitmentCount
) {
}
