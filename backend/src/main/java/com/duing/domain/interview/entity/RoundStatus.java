package com.duing.domain.interview.entity;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * InterviewRound 상태머신 (스펙 §5.1):
 * DRAFT → (발송) → COLLECTING → (자동배정) → ASSIGNING → (확정) → SCHEDULED(터미널)
 * DRAFT|COLLECTING|ASSIGNING → CANCELLED(터미널). ASSIGNING→COLLECTING 복귀 없음.
 * SCHEDULED 는 member.ASSIGNED 와의 이름 충돌을 피하고 future COMPLETED 확장 여지를 남긴 명명.
 */
public enum RoundStatus {
    DRAFT,
    COLLECTING,
    ASSIGNING,
    SCHEDULED,
    CANCELLED;

    public boolean isTerminal() {
        return this == SCHEDULED || this == CANCELLED;
    }

    private static final Set<RoundStatus> IN_PROGRESS_SET = Arrays.stream(values())
            .filter(status -> !status.isTerminal())
            .collect(Collectors.toUnmodifiableSet());

    /**
     * 진행 중(비터미널) 라운드 상태 집합 — 쿼리 IN 절용. isTerminal() 부정의 컬렉션 파생이라 상태가 추가돼도
     * 자동 추종한다. 리터럴 재열거(Set.of)를 만들지 말 것 — 사본이 갈라지면 진행 중 라운드가 있는 모집을 자동 마감한다.
     */
    public static Set<RoundStatus> inProgressSet() {
        return IN_PROGRESS_SET;
    }
}
