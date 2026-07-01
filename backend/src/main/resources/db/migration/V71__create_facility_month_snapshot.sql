-- 월 캐시 메타(빈 달 문제 해결). crawled_at = 해당 월 '마지막 성공' 수집 시각(stale/TTL 기준, lastUpdatedAt 출처).
-- fetch_status/last_error = '마지막 시도' 결과. 전체 실패(FAILED) 시 crawled_at 은 건드리지 않아 stale 기준을 보존한다.
CREATE TABLE facility_month_snapshot (
    id           BIGSERIAL PRIMARY KEY,
    year_month   VARCHAR(7)   NOT NULL UNIQUE,
    crawled_at   TIMESTAMP    NOT NULL,
    source       VARCHAR(20)  NOT NULL,
    fetch_status VARCHAR(20)  NOT NULL,
    last_error   VARCHAR(500),
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP
);
ALTER TABLE facility_month_snapshot ENABLE ROW LEVEL SECURITY;
