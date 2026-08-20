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
    EXCLUDED;

    /**
     * 미응답 파생의 단일 판정 지점 — 마감 경과 여부는 {@code InterviewRound#isAvailabilityDeadlinePassed} 가 낸다.
     * 멤버 엔티티가 아니라 상태 enum 이 판정을 갖는 이유는, 운영진 dashboard 가 엔티티 없이 상태 스칼라만
     * 담은 조회 projection(RoundMemberLine)으로 같은 파생을 내기 때문이다 — 엔티티에만 두면 사본이 생긴다.
     */
    public boolean isUnresponded(boolean availabilityDeadlinePassed) {
        return this == INVITED && availabilityDeadlinePassed;
    }
}
