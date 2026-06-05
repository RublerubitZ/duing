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
            boolean isManager = role == ClubMemberRole.LEADER || role == ClubMemberRole.OFFICER;
            boolean isLeader  = role == ClubMemberRole.LEADER;
            return new ClubActionPermissions(
                    isManager, isManager, isLeader,
                    isManager, isManager, isLeader
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
