-- 가입 코드: 동아리당 활성(미폐기) 1개. 폐기·만료 행도 감사 이력으로 보존한다.
-- 코드 행은 soft-delete 하지 않는다(폐기=revoked_at) — code 전역 unique 와 existsByCode 가 이 전제에 의존.
CREATE TABLE IF NOT EXISTS club_join_code (
    id             BIGSERIAL    PRIMARY KEY,
    club_id        BIGINT       NOT NULL REFERENCES club (id),
    recruitment_id BIGINT       NOT NULL REFERENCES recruitment (id),
    code           VARCHAR(6)   NOT NULL,
    generation     INTEGER,
    max_uses       INTEGER      NOT NULL CHECK (max_uses BETWEEN 1 AND 500),
    used_count     INTEGER      NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    expires_at     TIMESTAMP    NOT NULL,
    revoked_at     TIMESTAMP,
    created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_code_code ON club_join_code (code);
-- 동아리당 활성 코드 1개 (동시 재생성 race 도 DB 레벨 차단)
CREATE UNIQUE INDEX IF NOT EXISTS uk_club_join_code_active_per_club
    ON club_join_code (club_id) WHERE revoked_at IS NULL AND deleted_at IS NULL;

-- 누락 시 RowLevelSecurityMigrationTest 가 BUILD FAILED (V94 말미 주석·V92 전례)
ALTER TABLE club_join_code ENABLE ROW LEVEL SECURITY;
