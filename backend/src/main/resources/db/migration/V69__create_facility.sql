-- 학생회관 공용시설 캐시 목록. room_seq 는 학교 외부키(내부 매핑 전용, API 미노출)로 UNIQUE.
-- soft-delete(deleted_at) 는 이 도메인에서 미사용 — 도메인 아카이브는 archived_at 으로 표현한다(하드삭제 금지).
-- 신규 public 테이블은 RLS 를 켠다(V59 정책 준수, RowLevelSecurityMigrationTest 가드).
CREATE TABLE facility (
    id          BIGSERIAL PRIMARY KEY,
    room_seq    INT          NOT NULL UNIQUE,
    room_name   VARCHAR(100) NOT NULL,
    location    VARCHAR(100),
    sort_order  INT          NOT NULL DEFAULT 0,
    archived_at TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);
CREATE INDEX idx_facility_archived_at ON facility (archived_at);
ALTER TABLE facility ENABLE ROW LEVEL SECURITY;
