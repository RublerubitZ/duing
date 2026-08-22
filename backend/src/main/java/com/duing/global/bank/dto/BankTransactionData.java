package com.duing.global.bank.dto;

import java.time.LocalDateTime;

/**
 * BANK API 거래 1건을 도메인으로 옮기기 위한 운반 DTO.
 *
 * <p>{@code transactionAt} 은 KST 벽시계 기준(이미 한국시간)이며, {@code rawJson} 은 해당 거래
 * 원본 노드를 직렬화한 문자열로 적재용으로만 사용한다.
 *
 * <p><b>{@code transactionAt} 을 Instant 로 바꾸지 말 것 — 해시 멱등성 계약이다.</b>
 * {@link com.duing.domain.fee.support.TransactionHasher} 가 이 값의 {@code toString()} 을 그대로
 * dedup 해시 입력에 넣는데, transaction_hash 는 전역 unique 라 표현이 바뀌면 이미 적재된 거래가
 * 다른 해시로 재적재되어 회계 장부까지 중복 생성된다. 엔티티(bank_transaction.transaction_at)는
 * 정합 절대시각이며, 변환은 적재 경계(GeneralBankTransactionSyncService)에서만 한다.
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
