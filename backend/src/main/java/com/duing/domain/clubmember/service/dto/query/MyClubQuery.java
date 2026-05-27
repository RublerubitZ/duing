package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/**
 * 사용자(STUDENT/ADMIN 무관) 본인이 소속된 동아리 단건 — role 무관.
 * 마이페이지의 "가입한 동아리" 섹션이 사용한다.
 */
public record MyClubQuery(
        Long clubId,
        String clubName,
        String logoUrl,
        ClubMemberRole myRole,
        long activeRecruitmentCount,
        LocalDateTime joinedAt
) {
}
