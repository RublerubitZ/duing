package com.duing.domain.interview.entity;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * InterviewRoundMember 상태머신 (스펙 §5.2):
 * INVITED ↔ RESPONDED|NO_AVAILABLE_SLOT (COLLECTING && 마감 전 재응답),
 * RESPONDED → ASSIGNED (확정 시에만), INVITED|RESPONDED|NO_AVAILABLE_SLOT → EXCLUDED.
 * 회원 탈퇴 정리만은 ASSIGNED 도 EXCLUDED 로 바꾼다(#1637 — 탈퇴자의 확정 일정은 지킬 사람이 없다).
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

    /**
     * 운영진·결과 확정 정리가 이 상태의 멤버를 제외(EXCLUDED)로 바꿀 수 있는가 — {@code InterviewRoundMember#exclude()} 가드와
     * 결과 확정 정리 잠금 쿼리가 함께 쓰는 단일 판정. 막을 상태만 적는다: 새 상태는 기본으로 제외할 수 있다 — 결과가 정해진
     * 사람이 진행 중 라운드에 남는 쪽보다 낫다. 막아야 하는 상태가 생기면 여기에 추가한다.
     */
    public boolean isExcludable() {
        return this != ASSIGNED && this != EXCLUDED;
    }

    private static final Set<RoundMemberStatus> EXCLUDABLE_SET = Arrays.stream(values())
            .filter(RoundMemberStatus::isExcludable)
            .collect(Collectors.toUnmodifiableSet());

    /**
     * 제외할 수 있는 멤버 상태 집합 — 쿼리 IN 절용. isExcludable() 의 컬렉션 파생이라 상태가 추가돼도 자동 추종한다.
     * 리터럴 재열거(Set.of)를 만들지 말 것 — 사본이 갈라지면 결과 확정 정리가 exclude() 가 허용하는 멤버를 놓친다.
     */
    public static Set<RoundMemberStatus> excludableSet() {
        return EXCLUDABLE_SET;
    }
}
