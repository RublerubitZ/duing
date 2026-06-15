-- 회원가입 이메일 인증 코드 상태. 이메일당 1행 upsert 로 관리한다.
-- soft delete 미적용 (일회성 상태 — 가입 완료 시 행 삭제, 재발송 시 덮어씀).
CREATE TABLE email_verifications (
    id            BIGSERIAL    PRIMARY KEY,
    email         VARCHAR(100) NOT NULL,
    code_hash     VARCHAR(64)  NOT NULL,
    expires_at    TIMESTAMP    NOT NULL,
    verified_at   TIMESTAMP,
    attempt_count INT          NOT NULL DEFAULT 0,
    last_sent_at  TIMESTAMP    NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uk_email_verifications_email ON email_verifications (email);
