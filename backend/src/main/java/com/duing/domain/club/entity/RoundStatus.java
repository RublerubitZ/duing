package com.duing.domain.club.entity;

public enum RoundStatus {
    OPEN, CLOSED;

    public boolean isClosed() {
        return this == CLOSED;
    }
}
