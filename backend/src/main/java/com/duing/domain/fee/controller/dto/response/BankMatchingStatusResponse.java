package com.duing.domain.fee.controller.dto.response;

/**
 * 운영진의 BANK 자동매칭 사용 가능 여부 응답.
 * enabled=true 면 거래 동기화를 사용할 수 있는 상태(설정 사용 가능 + 지원 은행 계좌)이고,
 * false 면 미사용 상태다. 프론트는 이 값으로 거래 동기화 노출 여부를 사전에 결정한다.
 */
public record BankMatchingStatusResponse(boolean enabled) {

    public static BankMatchingStatusResponse of(boolean enabled) {
        return new BankMatchingStatusResponse(enabled);
    }
}
