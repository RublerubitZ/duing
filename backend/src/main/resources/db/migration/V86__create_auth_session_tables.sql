-- 세션 = 리프레시 토큰 패밀리. revoked_at 이 논리 폐기(soft delete 아님),
-- 물리 삭제는 AuthSessionCleanupJob 이 보존기간 후 수행(PiiRetentionJob 전례).
CREATE TABLE auth_session (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES users (id),
    platform      VARCHAR(20) NOT NULL,
    device_label  VARCHAR(100),
    user_agent    VARCHAR(500),
    ip_address    VARCHAR(45),
    remember_me   BOOLEAN     NOT NULL DEFAULT FALSE,
    last_used_at  TIMESTAMP   NOT NULL DEFAULT NOW(),
    expires_at    TIMESTAMP   NOT NULL,
    revoked_at    TIMESTAMP,
    revoke_reason VARCHAR(30),
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);
CREATE INDEX idx_auth_session_user_active ON auth_session (user_id, last_used_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_refresh_token (
    id         BIGSERIAL PRIMARY KEY,
    session_id BIGINT      NOT NULL REFERENCES auth_session (id),
    token_hash VARCHAR(64) NOT NULL,
    status     VARCHAR(10) NOT NULL,
    rotated_at TIMESTAMP,
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);
CREATE UNIQUE INDEX uq_auth_refresh_token_hash   ON auth_refresh_token (token_hash);
CREATE UNIQUE INDEX uq_auth_refresh_token_active ON auth_refresh_token (session_id) WHERE status = 'ACTIVE';

-- 인증 보안 이벤트 감사 로그. append-only (phone_verification_events 전례).
-- session_id 는 FK 미지정 — 세션 물리삭제 후에도 이벤트를 보존한다.
CREATE TABLE auth_event (
    id         BIGSERIAL PRIMARY KEY,
    user_id    BIGINT      REFERENCES users (id),
    session_id BIGINT,
    event_type VARCHAR(40) NOT NULL,
    detail     VARCHAR(500),
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    created_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP
);
CREATE INDEX idx_auth_event_user ON auth_event (user_id, created_at);

ALTER TABLE auth_session       ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_refresh_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_event         ENABLE ROW LEVEL SECURITY;
