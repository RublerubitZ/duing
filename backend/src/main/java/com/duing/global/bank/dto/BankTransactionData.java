package com.duing.global.bank.dto;

import java.time.LocalDateTime;

/**
 * BANK API 거래 1건을 도메인으로 옮기기 위한 운반 DTO.
 *
 * <p>{@code transactionAt} 은 KST 벽시계 기준(이미 한국시간)이며, {@code rawJson} 은 해당 거래
 * 원본 노드를 직렬화한 문자열로 적재용으로만 사용한다.
 */
public record BankTransactionData(
        LocalDateTime transactionAt,
        long amount,
        Long balance,
        String type,
        String counterparty,
        String description,
        String branch,
        String memo,
        String rawJson
) {

    public boolean isDeposit() {
        return "deposit".equalsIgnoreCase(type);
    }
}
