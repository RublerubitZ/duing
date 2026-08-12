-- 추천순(RECOMMENDED) 정렬용 동아리 활동 지표 집계 테이블.
-- ClubMetricRefreshJob 이 매시 재계산해 upsert 한다. 목록 정렬은 activity_score 만 참조하고
-- (favorite/application/last_activity 는 재계산·디버깅용 원천값), 행이 없는 신규 동아리는
-- 정렬 시 COALESCE(0) 으로 처리하므로 시드 데이터가 필요 없다.
CREATE TABLE IF NOT EXISTS club_metric (
    club_id           BIGINT PRIMARY KEY REFERENCES club (id),
    favorite_count    INT              NOT NULL DEFAULT 0,
    application_count INT              NOT NULL DEFAULT 0,
    last_activity_at  TIMESTAMP,
    activity_score    DOUBLE PRECISION NOT NULL DEFAULT 0,
    computed_at       TIMESTAMP        NOT NULL DEFAULT NOW()
);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE club_metric ENABLE ROW LEVEL SECURITY;
