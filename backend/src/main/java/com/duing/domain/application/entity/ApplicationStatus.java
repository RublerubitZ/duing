package com.duing.domain.application.entity;

public enum ApplicationStatus {
    SUBMITTED,
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
