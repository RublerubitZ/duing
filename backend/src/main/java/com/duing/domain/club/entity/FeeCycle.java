package com.duing.domain.club.entity;

/** 회비 납부 주기. NONE 은 "회비 없음"이며 이때 membershipFeeAmount 는 반드시 null (DB CHECK 백스톱). */
public enum FeeCycle {
    NONE,
    ONE_TIME,
    SEMESTER,
    YEARLY,
    MONTHLY
}
