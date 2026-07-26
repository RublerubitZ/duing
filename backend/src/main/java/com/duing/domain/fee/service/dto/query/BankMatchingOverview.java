package com.duing.domain.fee.service.dto.query;

import java.util.List;

/**
 * ADMIN BANK 자동매칭 관리 조회 결과. 동아리별 적격·등록 상태 목록과, 자동매칭이 켜진 동아리 수를 담는다.
 *
 * <p>{@code registeredCount} 는 DB 의 자동매칭 설정에서 직접 센 값이라 외부 호출 없이 항상 정확하다.
 * 과거에는 BANK API 의 "계좌 등록 슬롯"(등록수/최대/잔여)을 함께 실었으나, 2026-07-17 제공사 개편으로
 * 계좌 등록과 5계좌 한도가 폐지되면서 해당 조회가 404 로 실패하게 됐다. 지금은 상한 자체가 없으므로
 * 최대·잔여 값도 두지 않는다.
 */
public record BankMatchingOverview(
        List<BankMatchingClubResult> clubs,
        int registeredCount
) {
}
