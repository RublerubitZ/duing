package com.duing.domain.fee.service.dto.command;

import com.duing.domain.fee.entity.Bank;

/**
 * 회비 계좌 등록·수정 명령. {@code accountNumber} 는 평문 계좌번호이며,
 * 서비스 계층이 {@code FeeAccountCipher} 로 암호화한 뒤에야 영속화한다.
 */
public record UpsertFeeAccountCommand(
        Long clubId, Long actorId, Bank bank, String accountNumber, String accountHolder) {
}
