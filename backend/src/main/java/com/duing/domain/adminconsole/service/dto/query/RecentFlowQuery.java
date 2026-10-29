package com.duing.domain.adminconsole.service.dto.query;

/** 최근 days 일(롤링) 접수·처리 건수 — 신고·문의·시설 예약·홍보·회장 승계 5개 영역 합. */
public record RecentFlowQuery(int days, long receivedCount, long handledCount) {
}
