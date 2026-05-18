package com.duing.domain.user.entity;

public enum Grade {
    FRESHMAN("1학년"),
    SOPHOMORE("2학년"),
    JUNIOR("3학년"),
    SENIOR("4학년"),
    GRADUATE_DEFERRED("졸업유예");

    private final String displayName;

    Grade(String displayName) {
        this.displayName = displayName;
    }

    public String displayName() {
        return displayName;
    }
}
