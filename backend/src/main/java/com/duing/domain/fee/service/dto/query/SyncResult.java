package com.duing.domain.fee.service.dto.query;

/**
 * 거래 동기화 결과 요약.
 *
 * @param fetched       BANK API 가 조회 기간에 반환한 거래 건수
 * @param newlyStored   이번 동기화로 신규 적재된 건수(멱등 충돌로 무시된 건 제외)
 * @param autoMatched   신규 적재 입금 중 자동매칭(Tier 1/2)으로 납부까지 생성된 건수
 * @param pendingReview 신규 적재 입금 중 검토 대기(PENDING) 건수
 */
public record SyncResult(int fetched, int newlyStored, int autoMatched, int pendingReview) {}
