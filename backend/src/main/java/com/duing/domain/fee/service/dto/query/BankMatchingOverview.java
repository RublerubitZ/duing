package com.duing.domain.fee.service.dto.query;

import com.duing.global.bank.dto.AccountSlotStatus;
import java.util.List;

/**
 * ADMIN BANK 자동매칭 관리 조회 결과. 동아리별 적격·등록 상태 목록과,
 * 인증 키 전역의 계좌 등록 슬롯 현황({@link AccountSlotStatus})을 함께 담는다.
 * 슬롯은 동아리 단위가 아니라 BANK API 인증 키 단위 전역 한도이므로 목록과 분리해 한 번만 싣는다.
 */
public record BankMatchingOverview(
        List<BankMatchingClubResult> clubs,
        AccountSlotStatus slots
) {
}
