package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.dto.query.AdminFeeAccountQuery;

/**
 * 감사 콘솔 회비 계좌(스펙 §7.7). 열람 전용이라 평문 계좌번호는 어느 필드로도 나가지 않는다.
 * 복호화에 실패하면 {@code maskedAccountNumber} 만 null 이고 나머지 정보는 그대로 보인다.
 *
 * <p>미등록 동아리는 {@code registered=false} 에 나머지가 전부 null 이다.
 *
 * <p>{@code bankName} 은 은행 코드 문자열이다 — 한글 표시명은 {@link Bank} 규약대로 프론트엔드가 보유한다.
 */
public record AdminFeeAccountResponse(
        boolean registered,
        Bank bank,
        String bankName,
        String maskedAccountNumber,
        String accountHolder,
        boolean bankMatchingActive
) {
    public static AdminFeeAccountResponse from(AdminFeeAccountQuery accountQuery) {
        return new AdminFeeAccountResponse(
                accountQuery.registered(),
                accountQuery.bank(),
                accountQuery.bank() == null ? null : accountQuery.bank().name(),
                accountQuery.maskedAccountNumber(),
                accountQuery.accountHolder(),
                accountQuery.bankMatchingActive());
    }
}
