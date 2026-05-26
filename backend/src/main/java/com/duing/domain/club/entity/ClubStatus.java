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
