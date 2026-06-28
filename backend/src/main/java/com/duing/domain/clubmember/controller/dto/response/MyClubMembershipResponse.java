package com.duing.domain.clubmember.controller.dto.response;

import com.duing.domain.clubmember.entity.ClubMember;
import com.duing.domain.clubmember.entity.ClubMemberRole;
import java.time.LocalDateTime;

public record MyClubMembershipResponse(
        ClubMemberRole role,
        LocalDateTime joinedAt,
        ClubActionPermissions permissions
) {
    public record ClubActionPermissions(
            boolean canPostNotice,
            boolean canEditNotice,
            boolean canDeleteNotice,
            boolean canPostEvent,
            boolean canEditEvent,
            boolean canDeleteEvent
    ) {
        public static ClubActionPermissions from(ClubMemberRole role) {
            // 동아리 공지·일정의 생성/수정/삭제는 모두 운영진(LEADER/OFFICER) 권한이다.
            boolean isManager = role == ClubMemberRole.LEADER || role == ClubMemberRole.OFFICER;
            return new ClubActionPermissions(
                    isManager, isManager, isManager,
                    isManager, isManager, isManager
            );
        }
    }

    public static MyClubMembershipResponse from(ClubMember member) {
        return new MyClubMembershipResponse(
                member.getRole(),
                member.getCreatedAt(),
                ClubActionPermissions.from(member.getRole())
        );
    }
}
