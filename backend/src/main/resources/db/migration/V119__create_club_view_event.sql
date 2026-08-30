-- 홈 "관심도가 높은 동아리" 집계 원천 — 동아리 상세 진입을 (방문자, 동아리, 날짜) 당 1행으로 적재한다.
-- 같은 사람이 하루에 같은 동아리를 몇 번 열어도 아래 UNIQUE 가 1행으로 접으므로, 반복 새로고침이
-- 관심도를 부풀리지 못한다 — dedup 의 단일 지점은 애플리케이션 코드가 아니라 이 제약이다.
--
-- visitor_hash: 클라이언트가 보관하는 익명 방문자 키(UUID)의 SHA-256 hex. 원문은 저장하지 않으므로
--   DB 가 새도 그 값으로 특정 방문자를 사칭할 수 없다. 날짜별 salt 를 섞지 않는 이유는 "최근 7일
--   순방문자 수"(= COUNT DISTINCT visitor_hash)가 날짜를 가로질러 같은 사람을 한 명으로 세야 하기
--   때문이다 — 대신 보존 기간을 8일로 묶어 장기 행동 프로파일이 쌓이지 않게 한다.
-- event_date: KST 날짜(seoulClock). 집계 창 7일, 보존 8일 — 정리는 ClubMetricRefreshJob 이 겸한다.
CREATE TABLE club_view_event (
    id           BIGSERIAL PRIMARY KEY,
    club_id      BIGINT   NOT NULL REFERENCES club (id),
    visitor_hash VARCHAR(64) NOT NULL,
    event_date   DATE     NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- dedup 의 단일 지점 — 삽입은 ON CONFLICT DO NOTHING 으로 이 인덱스에 얹힌다.
CREATE UNIQUE INDEX uq_cve_club_visitor_date ON club_view_event (club_id, visitor_hash, event_date);
-- 집계 창(event_date > 기준일) 스캔과 보존 정리(event_date < 기준일) 전용.
CREATE INDEX idx_cve_event_date ON club_view_event (event_date);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE club_view_event ENABLE ROW LEVEL SECURITY;

-- 관심도 집계 결과 2열. 기존 activity_score(추천순)와는 별개 축이다 —
-- 정렬은 interest_score(최근성 감쇠 적용), 화면 표시는 weekly_visitor_count(감쇠 없는 실제 사람 수)를 쓴다.
-- 배치 전이거나 조회 이력이 없는 동아리는 DEFAULT 0 이라 시드가 필요 없다(activity_score 와 같은 규약).
ALTER TABLE club_metric
    ADD COLUMN interest_score       DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN weekly_visitor_count INT              NOT NULL DEFAULT 0;
