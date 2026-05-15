package com.duing.domain.recruitment.entity;

import com.duing.domain.clubmember.entity.ClubMemberRole;

public enum TargetRole {
    MEMBER,
    OFFICER;

    public ClubMemberRole toClubMemberRole() {
        return switch (this) {
            case MEMBER -> ClubMemberRole.MEMBER;
            case OFFICER -> ClubMemberRole.OFFICER;
        };
    }
}
