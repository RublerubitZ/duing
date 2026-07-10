-- MO(문자 발신) 인증 세션. 번호당 1행 upsert 로 관리한다 (spec §5.1).
-- 인증 코드 컬럼이 없다 — 코드는 token 에서 HMAC 파생하며 DB 에 저장하지 않는다 (spec §5.2).
-- soft delete 미적용 (일회성 상태 — 용도 완료 시 행 삭제, 재발급 시 덮어씀).
CREATE TABLE IF NOT EXISTS phone_verifications (
    id              BIGSERIAL    PRIMARY KEY,
    phone           VARCHAR(13)  NOT NULL,
    token           VARCHAR(36)  NOT NULL,
    purpose         VARCHAR(20)  NOT NULL,
    target_user_id  BIGINT,
    expires_at      TIMESTAMP    NOT NULL,
    verified_at     TIMESTAMP,
    last_issued_at  TIMESTAMP    NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_phone ON phone_verifications (phone);
CREATE UNIQUE INDEX IF NOT EXISTS uk_phone_verifications_token ON phone_verifications (token);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- 인증 감사 이벤트 (insert-only, spec §9.3). raw phone(PII) 포함 — PiiRetentionJob 이 45일 후 물리 삭제.
CREATE TABLE IF NOT EXISTS phone_verification_events (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT,
    phone       VARCHAR(13)  NOT NULL,
    purpose     VARCHAR(20)  NOT NULL,
    event_type  VARCHAR(20)  NOT NULL,
    client_ip   VARCHAR(45),
    user_agent  VARCHAR(300),
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pve_phone ON phone_verification_events (phone);
CREATE INDEX IF NOT EXISTS idx_pve_user ON phone_verification_events (user_id);

ALTER TABLE phone_verification_events ENABLE ROW LEVEL SECURITY;

-- MO 인증 완료 시각. null = 미인증(레거시 자기신고 번호). 엔티티 매핑·기록은 PR2 에서 (spec §9.1).
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP;
