package com.duing.domain.federation.entity;

public enum FederationInquiryStatus {
    RECEIVED, IN_PROGRESS, ANSWERED, CLOSED;

    /** 관리자 상태 변경 API가 허용하는 전이. ANSWERED 는 답변 등록으로만 진입(수동 지정 불가). */
    public boolean canTransitionTo(FederationInquiryStatus next) {
        if (this == next) return false;
        return switch (this) {
            case RECEIVED -> next == IN_PROGRESS || next == CLOSED;
            case IN_PROGRESS -> next == CLOSED;
            case ANSWERED -> next == CLOSED;
            case CLOSED -> false;
        };
    }

    /** 작성자 수정 허용 — 관리자가 답변 작성을 시작(IN_PROGRESS)하기 전까지만. */
    public boolean isEditableByAuthor() {
        return this == RECEIVED;
    }

    /** 답변 등록 가능 상태. RECEIVED 직행은 version echo 필수(서비스에서 검증). */
    public boolean canReceiveAnswer() {
        return this == RECEIVED || this == IN_PROGRESS;
    }
}
