package com.duing.domain.fee.service.dto.query;

import com.duing.domain.fee.entity.Bank;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행.
 *
 * <p>{@code eligible} 은 회비 계좌가 등록돼 있고 지원 은행(NH/KB/우리)인지 여부다.
 * 부적격이면 {@code ineligibleReason} 에 사람이 읽을 수 있는 사유를 담고, 적격이면 null 이다.
 * {@code registered} 는 자동매칭 설정이 실제 동작 가능(active && api_registered)한 상태인지다.
 * {@code maskedAccountNumber} 는 끝 4자리만 노출한 마스킹 문자열이며, 복호화 실패 시 null 이다.
 */
public record BankMatchingClubResult(
        Long clubId,
        String clubName,
        Bank bank,
        String accountHolder,
        String maskedAccountNumber,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {
}
