package com.duing.domain.adminconsole.service.dto.query;

import java.util.List;

/** 처리 대기 추이 — 지난 13일 하루 끝 남은 대기 건수와 최근 7일 접수·처리. 오늘 값은 pending-counts 가 맡는다. */
public record AdminPendingTrendQuery(List<DailyPendingTotalQuery> days, RecentFlowQuery recentFlow) {
}
