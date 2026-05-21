package com.duing.domain.promotion.entity;

public enum PromotionRequestStatus {
    PENDING, ACCEPTED, REJECTED;

    public boolean isTerminal() {
        return this == ACCEPTED || this == REJECTED;
    }
}
