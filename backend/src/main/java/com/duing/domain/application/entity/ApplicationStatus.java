package com.duing.domain.application.entity;

public enum ApplicationStatus {
    SUBMITTED,
    // 운영진 내부 관리용 "아직 결정하지 않음". 지원자에게는 SUBMITTED 와 동일하게 노출한다
    // (강제는 asApplicantVisible 이 한다 — 주석만으로는 응답에 그대로 실린다).
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

    /**
     * 지원자 본인에게 내보낼 상태. 운영진의 내부 판단 단계인 ON_HOLD 는 접수 상태와 구분되지 않게 가린다 —
     * "보류 중"이라는 사실 자체가 지원자에게 알릴 정보가 아니고, 알리면 아직 결정되지 않은 심사를
     * 통보한 것처럼 읽힌다. 화면에서만 가리면 매핑이 한 번 회귀하는 순간 원시 응답으로 새 나간다.
     */
    public ApplicationStatus asApplicantVisible() {
        return this == ON_HOLD ? SUBMITTED : this;
    }
}
