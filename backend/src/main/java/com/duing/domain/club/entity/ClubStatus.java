package com.duing.domain.club.entity;

public enum ClubStatus {
    /** 동아리 등록 후 총동연 승인을 기다리는 초기 상태 */
    PENDING_APPROVAL,
    /** 총동연이 승인하여 학생에게 노출되는 운영 상태 */
    ACTIVE,
    /** 정상 운영 후 해체/장기 휴면 등으로 운영을 중단한 상태 */
    INACTIVE,
    /** 총동연이 승인을 거절한 상태. PENDING_APPROVAL 로 재진입(재신청) 가능. */
    REJECTED;

    /**
     * 학생/공개 경로에 노출되는 상태인지 — "비공개 동아리는 존재 자체를 숨긴다(404)" 규칙의 단일 정의.
     * 403 이 아닌 404 로 응답해, 임의 ID 로 동아리의 존재·상태를 알아내는 열거(enumeration)를 막는다.
     * 공개 경로의 게이트는 {@link com.duing.domain.club.service.ClubVisibilityPolicy} 를 쓴다.
     * 네이티브 SQL 'ACTIVE' 리터럴 3곳과의 동기화는 ClubStatusVisibilityTest 가 고정한다.
     */
    public boolean isPubliclyVisible() {
        return this == ACTIVE;
    }

    public boolean canTransitionTo(ClubStatus next) {
        if (this == next) return false;
        return switch (this) {
            case PENDING_APPROVAL -> next == ACTIVE || next == REJECTED;
            case ACTIVE           -> next == INACTIVE;
            case INACTIVE         -> next == ACTIVE;
            case REJECTED         -> next == PENDING_APPROVAL;
        };
    }
}
