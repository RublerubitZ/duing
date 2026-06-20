package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.entity.Bank;
import com.duing.domain.fee.service.dto.query.BankMatchingClubResult;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행 응답.
 * {@code eligible} 이 false 면 {@code ineligibleReason} 에 사유가 담기고, true 면 null 이다.
 * {@code maskedAccountNumber} 는 끝 4자리만 노출한 마스킹 문자열이며, 복호화 실패 시 null 이다.
 */
public record BankMatchingClubResponse(
        Long clubId,
        String clubName,
        Bank bank,
        String accountHolder,
        String maskedAccountNumber,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {

    public static BankMatchingClubResponse from(BankMatchingClubResult result) {
        return new BankMatchingClubResponse(
                result.clubId(),
                result.clubName(),
                result.bank(),
                result.accountHolder(),
                result.maskedAccountNumber(),
                result.eligible(),
                result.ineligibleReason(),
                result.registered());
    }
}
