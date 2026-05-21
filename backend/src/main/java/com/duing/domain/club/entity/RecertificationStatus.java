package com.duing.domain.club.entity;

public enum RecertificationStatus {
    PENDING, APPROVED, REJECTED;

    public boolean isTerminal() {
        return this == APPROVED || this == REJECTED;
    }
}
