package com.duing.domain.clubmember.entity;

import java.util.Set;

public enum ClubMemberRole {
    MEMBER,
    OFFICER,
    LEADER;

    /**
     * 운영진(동아리 운영 권한) 역할 집합의 단일 정의 — 쿼리 IN 절도 이 상수를 쓴다.
     * 역할이 추가·변경될 때 이 집합 하나만 고치면 판정·쿼리가 함께 따라온다.
     */
    public static final Set<ClubMemberRole> MANAGER_ROLES = Set.of(LEADER, OFFICER);

    /**
     * 동아리 운영(모집 공고·지원자 관리 등)이 가능한 역할인지 여부 — MANAGER_ROLES 의 술어 파생.
     */
    public boolean canManageClub() {
        return MANAGER_ROLES.contains(this);
    }
}
