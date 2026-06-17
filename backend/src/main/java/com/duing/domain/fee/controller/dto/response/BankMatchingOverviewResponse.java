package com.duing.domain.fee.controller.dto.response;

import com.duing.domain.fee.service.dto.query.BankMatchingOverview;
import java.util.List;

/**
 * ADMIN BANK 자동매칭 관리 조회 응답. 동아리별 상태 목록과 인증 키 전역 슬롯 현황을 함께 담는다.
 * {@code slots} 는 BANK API 일시 장애로 슬롯 현황을 가져오지 못한 경우 null 일 수 있다 —
 * 이때도 동아리 목록은 그대로 반환된다(graceful degrade).
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
        // BANK API 장애로 슬롯 현황이 비어 있으면(null) 슬롯만 생략하고 목록은 정상 응답한다.
        SlotStatus slots = overview.slots() == null ? null : new SlotStatus(
                overview.slots().registeredCount(),
                overview.slots().maxAccounts(),
                overview.slots().remaining());
        return new BankMatchingOverviewResponse(clubs, slots);
    }
}
