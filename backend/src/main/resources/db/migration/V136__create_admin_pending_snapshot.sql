-- 총동연 홈 처리 대기 추이(스펙 2026-10-29-admin-pending-trend-design §4).
-- KST 날짜당 1행, 그날 하루 끝(다음 날 00:01 KST) 남은 대기 건수(AdminPendingCountsQueryService 와 같은 정의)를 영역별·합계로 남긴다.
-- 한 날짜의 첫 기록만 남긴다(INSERT … ON CONFLICT DO NOTHING) — 낮에 다시 돌려도 "하루 끝" 의미가 깨지지 않게.
-- recorded_at 은 TIMESTAMPTZ + 엔티티 Instant(V122 전례). 정수는 INT(엔티티 int — SMALLINT 는 validate 에서 short 매핑 요구, V134).
-- 새 테이블만 만드는 Expand-only 라 BE 롤백 시 이전 이미지는 이 테이블을 무시한다.
CREATE TABLE IF NOT EXISTS admin_pending_snapshot (
    snapshot_date              DATE PRIMARY KEY,
    club_approval              INT  NOT NULL,
    facility_booking           INT  NOT NULL,
    inquiry_unanswered         INT  NOT NULL,
    promotion_request          INT  NOT NULL,
    report_unresolved          INT  NOT NULL,
    leader_succession          INT  NOT NULL,
    stale_pending_recruitment  INT  NOT NULL,
    total_pending_count        INT  NOT NULL,
    recorded_at                TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE admin_pending_snapshot ENABLE ROW LEVEL SECURITY;
