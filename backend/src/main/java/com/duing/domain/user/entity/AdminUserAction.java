package com.duing.domain.user.entity;

/**
 * 관리자 조치 감사 액션. PHONE_VIEW 는 기존 회장 번호 조회 서버 로그(action=PHONE_VIEW)와 같은 이름이다
 * — 두 경로를 하나의 키워드로 검색할 수 있게 용어를 통일한다.
 */
public enum AdminUserAction {
    ACCOUNT_SUSPENDED,
    ACCOUNT_UNSUSPENDED,
    FORCE_LOGOUT,
    ADMIN_NOTE_UPDATED,
    PHONE_VIEW
}
