package com.duing.domain.facility.entity;

/** 이용현황 응답의 데이터 출처. CACHE=캐시만 / LIVE_FETCH=이번 요청이 온디맨드 수집 / STALE_CACHE=라이브 실패 후 옛 캐시. */
public enum DataSource {
    CACHE,
    LIVE_FETCH,
    STALE_CACHE
}
