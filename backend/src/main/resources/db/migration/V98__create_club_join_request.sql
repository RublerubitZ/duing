-- 가입 요청: 승인 시 ClubMember 가 생성된다. APPROVED 행이 곧 코드 사용 감사 이력이므로
-- 별도 사용 이력 테이블은 두지 않는다(스펙 3).
CREATE TABLE IF NOT EXISTS club_join_request (
    id            BIGSERIAL   PRIMARY KEY,
    club_id       BIGINT      NOT NULL REFERENCES club (id),
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    join_code_id  BIGINT      NOT NULL REFERENCES club_join_code (id),
    generation    INTEGER,
    status        VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reject_reason VARCHAR(100),
    reviewed_by   BIGINT      REFERENCES users (id),
    reviewed_at   TIMESTAMP,
    version       BIGINT      NOT NULL DEFAULT 0,
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

-- 사용자당 동아리별 대기 요청 1개 (동시 중복 요청 DB 레벨 차단)
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_request_pending
    ON club_join_request (club_id, user_id) WHERE status = 'PENDING' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_club_join_request_club_status
    ON club_join_request (club_id, status);

-- 누락 시 RowLevelSecurityMigrationTest 가 BUILD FAILED (V97 전례)
ALTER TABLE club_join_request ENABLE ROW LEVEL SECURITY;
