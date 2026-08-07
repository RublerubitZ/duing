package com.duing.domain.fee.repository;

/**
 * 기간 내 매칭 완료(자동+수동) 거래 수와 그중 수동 매칭 수 — 이상징후 FA-01 의 분모·분자다.
 * 매칭 대기·무시 거래는 애초에 세지 않으므로 {@code manualCount} 는 언제나 {@code matchedCount} 이하다.
 */
public record AdminFeeMatchAggregate(long matchedCount, long manualCount) {

    public static final AdminFeeMatchAggregate EMPTY = new AdminFeeMatchAggregate(0L, 0L);
}
