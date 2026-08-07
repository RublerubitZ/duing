package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.Bank;

/**
 * 감사 콘솔 회비 계좌(스펙 §7.7). 열람 전용이라 평문 계좌번호는 어느 경로로도 나가지 않는다 —
 * {@code maskedAccountNumber} 만 채우고, 복호화에 실패하면 그 값만 null 로 비운다(graceful degrade).
 */
public record AdminFeeAccountQuery(
        boolean registered,
        Bank bank,
        String maskedAccountNumber,
        String accountHolder,
        boolean bankMatchingActive
) {
    /** 계좌 미등록 동아리 — 은행·예금주 없이 registered=false 만 내려간다. */
    public static AdminFeeAccountQuery notRegistered() {
        return new AdminFeeAccountQuery(false, null, null, null, false);
    }
}
