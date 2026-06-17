package com.duing.domain.fee.controller.dto.request;

import com.duing.domain.fee.service.dto.command.SyncTransactionsCommand;
import jakarta.validation.constraints.NotBlank;

/**
 * 거래 동기화 요청. 계좌 비밀번호와 주민등록번호 앞 6자리를 받아 BANK API 거래 조회에만 사용한다.
 *
 * <p><b>보안</b>: 민감 인증정보가 로그·예외 메시지에 흘러가지 않도록 기본 record toString 을
 * 마스킹 상수로 오버라이드한다. 이 객체를 절대 그대로 로깅하지 않는다.
 */
public record SyncBankTransactionsRequest(
        @NotBlank(message = "계좌 비밀번호는 필수입니다.") String accountPassword,
        @NotBlank(message = "주민등록번호 앞 6자리는 필수입니다.") String residentNumber
) {

    /** 민감값 유출 방지 — 기본 record toString(필드 평문 출력)을 마스킹한다. */
    @Override
    public String toString() {
        return "SyncBankTransactionsRequest[REDACTED]";
    }

    public SyncTransactionsCommand toCommand(Long clubId, Long actorId) {
        return new SyncTransactionsCommand(clubId, actorId, accountPassword, residentNumber);
    }
}
