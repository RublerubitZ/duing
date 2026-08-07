package com.duing.domain.fee.service.dto.query;

/**
 * 감사 콘솔 청구 필터(스펙 §7.5). raw {@code FeeStatus} 가 아니라 화면 칩과 1:1 인 의미 enum 이다.
 *
 * <p>UNPAID·OVERDUE 는 저장된 status 가 아니라 마감일로 갈린다 — 연체 전이 배치가 하루 늦거나
 * 꺼져 있어도 감사 결과가 흔들리지 않아야 하기 때문이다(스펙 §15 결정 10).
 * 마감 당일은 아직 연체가 아니므로 UNPAID 에 들어간다.
 */
public enum AdminFeeBillFilter {
    PAID, UNPAID, OVERDUE, CANCELLED
}
