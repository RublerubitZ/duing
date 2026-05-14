package com.duing.domain.user.entity;

/**
 * 시스템 전역 역할(Global role).
 * 동아리 단위 역할(MEMBER/OFFICER/LEADER)은 {@code ClubMember.role} 로 별도 관리한다.
 */
public enum UserRole {
    STUDENT,
    ADMIN
}
