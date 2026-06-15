package com.duing.domain.interview.entity;

/**
 * InterviewRoundMember 상태머신 (스펙 §5.2):
 * INVITED ↔ RESPONDED|NO_AVAILABLE_SLOT (COLLECTING && 마감 전 재응답),
 * RESPONDED → ASSIGNED (확정 시에만), INVITED|RESPONDED|NO_AVAILABLE_SLOT → EXCLUDED.
 * 미응답(NO_RESPONSE)은 저장하지 않고 INVITED && now > round.availabilityDeadline 로 파생한다.
 */
public enum RoundMemberStatus {
    INVITED,
    RESPONDED,
    NO_AVAILABLE_SLOT,
    ASSIGNED,
    EXCLUDED
}
