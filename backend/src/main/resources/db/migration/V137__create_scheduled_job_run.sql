-- 총동연 홈 자동 작업 상태(스펙 2026-10-30-admin-job-status-design §4).
-- 작업(MonitoredJob)마다 최근 실행 한 줄을 덮어쓴다(INSERT … ON CONFLICT DO UPDATE) — 최대 5줄, 이력·정리 잡 없음.
-- consecutive_unhealthy_runs 는 일부 실패·실패가 이어진 횟수(성공이면 0) — 10분 잡의 일시 흔들림을 경고하지 않으려고 둔다.
-- 시각은 TIMESTAMPTZ + 엔티티 Instant(V136 전례), 정수는 INT(엔티티 int — V134).
-- 새 테이블만 만드는 Expand-only 라 BE 롤백 시 이전 이미지는 이 테이블을 무시한다.
CREATE TABLE IF NOT EXISTS scheduled_job_run (
    job_key                    VARCHAR(40) PRIMARY KEY,
    last_started_at            TIMESTAMP WITH TIME ZONE NOT NULL,
    last_finished_at           TIMESTAMP WITH TIME ZONE NOT NULL,
    last_outcome               VARCHAR(20) NOT NULL,
    last_result_count          INT         NOT NULL,
    last_failed_count          INT         NOT NULL,
    last_succeeded_at          TIMESTAMP WITH TIME ZONE,
    consecutive_unhealthy_runs INT         NOT NULL DEFAULT 0
);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE scheduled_job_run ENABLE ROW LEVEL SECURITY;
