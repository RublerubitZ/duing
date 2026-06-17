package com.duing.domain.fee.service.dto.command;

/**
 * 거래 동기화 입력. {@code accountPassword}·{@code residentNumber} 는 BANK API 거래 조회 호출에만 쓰는
 * 민감 인증정보다 — DB·캐시·로그·이벤트·raw_payload 어디에도 저장/출력하지 않고, 처리 후 스코프 종료로 폐기한다.
 * 절대 toString/로깅 대상에 노출하지 않는다.
 */
public record SyncTransactionsCommand(
        Long clubId,
        Long actorId,
        String accountPassword,
        String residentNumber
) {

    /** 민감 인증정보가 로그·예외 메시지에 흘러가지 않도록 기본 record toString 을 마스킹한다. */
    @Override
    public String toString() {
        return "SyncTransactionsCommand[REDACTED]";
    }
}
