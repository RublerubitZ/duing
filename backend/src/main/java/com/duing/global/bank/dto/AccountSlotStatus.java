package com.duing.global.bank.dto;

/**
 * BANK API 계좌 등록 슬롯 현황. 한 인증 키당 등록 가능한 계좌 수에 제한이 있다.
 */
public record AccountSlotStatus(
        int registeredCount,
        int maxAccounts,
        int remaining
) {}
