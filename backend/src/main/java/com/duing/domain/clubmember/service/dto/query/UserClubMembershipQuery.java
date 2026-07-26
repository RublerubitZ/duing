package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/** 회원 한 명이 가입한 동아리 한 건. 탈퇴(soft-delete)한 멤버십은 @SQLRestriction 으로 자동 제외된다. */
public record UserClubMembershipQuery(
        Long clubId,
        String clubName,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
}
