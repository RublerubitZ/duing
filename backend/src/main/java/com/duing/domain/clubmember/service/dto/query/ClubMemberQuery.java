package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record ClubMemberQuery(
        Long memberId,
        Long userId,
        String name,
        String studentId,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberQuery from(ClubMember clubMember) {
        return new ClubMemberQuery(
                clubMember.getId(),
                clubMember.getUser().getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getRole(),
                clubMember.getCreatedAt()
        );
    }
}
