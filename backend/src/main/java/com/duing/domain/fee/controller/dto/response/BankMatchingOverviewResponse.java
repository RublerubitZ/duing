package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.BankMatchingOverview;
import java.util.List;

/**
 * ADMIN BANK 자동매칭 관리 조회 응답. 동아리별 상태 목록과 자동매칭이 켜진 동아리 수를 담는다.
 * 두 값 모두 DB 에서 산출하므로 외부 BANK API 장애와 무관하게 항상 채워진다.
 */
public record BankMatchingOverviewResponse(
        List<BankMatchingClubResponse> clubs,
        int registeredCount
) {

    public static BankMatchingOverviewResponse from(BankMatchingOverview overview) {
        List<BankMatchingClubResponse> clubs = overview.clubs().stream()
                .map(BankMatchingClubResponse::from)
                .toList();
        return new BankMatchingOverviewResponse(clubs, overview.registeredCount());
    }
}
