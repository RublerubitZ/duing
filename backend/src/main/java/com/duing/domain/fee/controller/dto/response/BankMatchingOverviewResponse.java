package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.BankMatchingOverview;
import java.util.List;

/**
 * ADMIN BANK 자동매칭 관리 조회 응답. 동아리별 상태 목록과 인증 키 전역 슬롯 현황을 함께 담는다.
 */
public record BankMatchingOverviewResponse(
        List<BankMatchingClubResponse> clubs,
        SlotStatus slots
) {

    /** BANK API 계좌 등록 슬롯 현황(인증 키 단위 전역 한도). */
    public record SlotStatus(int registeredCount, int maxAccounts, int remaining) {
    }

    public static BankMatchingOverviewResponse from(BankMatchingOverview overview) {
        List<BankMatchingClubResponse> clubs = overview.clubs().stream()
                .map(BankMatchingClubResponse::from)
                .toList();
        SlotStatus slots = new SlotStatus(
                overview.slots().registeredCount(),
                overview.slots().maxAccounts(),
                overview.slots().remaining());
        return new BankMatchingOverviewResponse(clubs, slots);
    }
}
