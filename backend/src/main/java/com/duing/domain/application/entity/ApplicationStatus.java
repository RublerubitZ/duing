package com.duing.domain.application.entity;

public enum ApplicationStatus {
    SUBMITTED,
    // 새 전이표에서 어떤 전이도 허용하지 않는 죽은 상태. V97 로 잔존 데이터를 SUBMITTED 로 치환했고,
    // 통계·면접 단계 파생이 아직 참조하고 있어 상수 제거는 후속 작업에서 일괄 수행한다.
    UNDER_REVIEW,
    // 운영진 내부 관리용 "아직 결정하지 않음". 지원자에게는 SUBMITTED 와 동일하게 노출한다.
    ON_HOLD,
    INTERVIEW_PENDING,
    ACCEPTED,
    REJECTED;

    public boolean isTerminal() {
        return this == ACCEPTED || this == REJECTED;
    }

    public boolean isActive() {
        return !isTerminal();
    }
}
