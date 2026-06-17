package com.duing.domain.fee.service.dto.query;

/**
 * ADMIN BANK 자동매칭 관리 화면의 동아리 한 행.
 *
 * <p>{@code eligible} 은 회비 계좌가 등록돼 있고 지원 은행(NH/KB/우리)인지 여부다.
 * 부적격이면 {@code ineligibleReason} 에 사람이 읽을 수 있는 사유를 담고, 적격이면 null 이다.
 * {@code registered} 는 자동매칭 설정이 실제 동작 가능(active && api_registered)한 상태인지다.
 */
public record BankMatchingClubResult(
        Long clubId,
        String clubName,
        boolean eligible,
        String ineligibleReason,
        boolean registered
) {
}
