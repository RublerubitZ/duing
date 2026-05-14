package com.duing.domain.clubmember.entity;

public enum ClubMemberRole {
    MEMBER,
    OFFICER,
    LEADER;

    /**
     * 동아리 운영(모집 공고·지원자 관리 등)이 가능한 역할인지 여부.
     * LEADER 와 OFFICER 가 운영 권한을 가진다.
     */
    public boolean canManageClub() {
        return this == LEADER || this == OFFICER;
    }
}
