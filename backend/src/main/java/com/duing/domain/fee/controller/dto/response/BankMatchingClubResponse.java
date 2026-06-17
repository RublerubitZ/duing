package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.BankMatchingClubResult;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행 응답.
 * {@code eligible} 이 false 면 {@code ineligibleReason} 에 사유가 담기고, true 면 null 이다.
 */
public record BankMatchingClubResponse(
        Long clubId,
        String clubName,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {

    public static BankMatchingClubResponse from(BankMatchingClubResult result) {
        return new BankMatchingClubResponse(
                result.clubId(),
                result.clubName(),
                result.eligible(),
                result.ineligibleReason(),
                result.registered());
    }
}
