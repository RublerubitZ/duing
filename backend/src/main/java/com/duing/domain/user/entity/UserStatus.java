package com.duing.domain.user.entity;

/** 계정 상태. 정지(SUSPENDED)는 로그인·API 접근 차단이며 탈퇴(soft delete)와 별개다. */
public enum UserStatus {
    ACTIVE,
    SUSPENDED
}
