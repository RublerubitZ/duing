package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

/**
 * 회원 한 명이 가입한 동아리 한 건.
 *
 * <p>제외되는 것은 두 가지다. 탈퇴(soft-delete)한 멤버십은 ClubMember 의 {@code @SQLRestriction} 으로,
 * 삭제(soft-delete)된 동아리는 club 을 참조하는 암묵 조인에 Club 의 {@code @SQLRestriction} 이 걸려
 * 함께 빠진다.
 *
 * <p>반면 {@code ClubStatus.INACTIVE}(운영 중단) 동아리는 그대로 남는다 — 상태는 soft-delete 와 별개다.
 * 후속으로 "폐쇄 동아리 숨김" 이 필요해지면 쿼리에 status 조건을 따로 걸어야 한다.
 */
public record UserClubMembershipQuery(
        Long clubId,
        String clubName,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
}
