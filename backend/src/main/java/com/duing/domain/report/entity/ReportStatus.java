package com.duing.domain.report.entity;

public enum ReportStatus {
    PENDING, RESOLVED, DISMISSED;

    public boolean isTerminal() {
        return this == RESOLVED || this == DISMISSED;
    }
}
