package com.duing.domain.clubmember.service.dto.query;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record ClubMemberExportQuery(
        Long memberId,
        String name,
        String studentId,
        String major,
        String phone,
        ClubMemberRole role,
        LocalDateTime joinedAt
) {
    public static ClubMemberExportQuery from(ClubMember clubMember, boolean includePhone) {
        return new ClubMemberExportQuery(
                clubMember.getId(),
                clubMember.getUser().getName(),
                clubMember.getUser().getStudentId(),
                clubMember.getUser().getMajor(),
                includePhone ? clubMember.getUser().getPhone() : null,
                clubMember.getRole(),
                clubMember.getCreatedAt()
        );
    }
}
