package com.duing.domain.fee.service.dto.query;

/**
 * 상세 KPI 청구 건수 분류(스펙 §7.3). 미납·연체는 DB status 가 아니라 마감일 파생이다(스펙 §15 결정 10).
 *
 * <p>{@code billCount} 는 CANCELLED 를 포함한 전체 건수다 — 취소 건수를 따로 보여주는 화면이라
 * 쿼리 where 에 {@code status != CANCELLED} 를 넣지 않는다. 네 분류의 합이 곧 billCount 가 된다.
 * 반면 금액 집계(totalBilled/totalPaid)는 목록과 같은 기준으로 CANCELLED 를 제외하므로
 * 두 값의 모수가 다르다는 점에 주의한다.
 */
public record AdminFeeKpiProjection(
        long billCount, long paidCount, long unpaidCount, long overdueCount, long cancelledCount
) {
}
