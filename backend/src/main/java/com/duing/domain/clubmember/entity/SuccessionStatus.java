package com.duing.domain.clubmember.entity;

public enum SuccessionStatus {
    PENDING, APPROVED, REJECTED;

    public boolean isTerminal() {
        return this == APPROVED || this == REJECTED;
    }
}
