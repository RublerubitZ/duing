package com.duing.global.bank.dto;

import java.util.List;

/**
 * BANK API 거래 조회 결과.
 *
 * <p>{@code fullyRead} 는 응답의 {@code transactions} 가 배열이고 건너뛴 거래가 0건일 때만 참이다(빈 배열은 참).
 * 거짓이어도 읽은 거래는 그대로 적재하지만, 호출자는 이 조회를 '끝까지 본 기간'으로 기억하지 않는다 — 기억하면
 * 다 보지 못한 동기화 뒤에 못 본 기간 안내가 사라진다.
 */
public record TransactionLookupResult(List<BankTransactionData> transactions, boolean fullyRead) {}
