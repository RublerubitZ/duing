-- 회비 감사 의견 + 운영 메모(스펙 §3.2). 둘 다 "총동연이 동아리에 남기는 텍스트"라 같은 구조여서
-- 테이블 하나에 kind 로 구분한다(스펙 §15 결정 2). 감사 산출물이라 append-only 가 아니라 수정·삭제를 허용한다.
--
-- 상태는 의견에만 있다 — 메모에 status 가 붙는 조합은 CHECK 로 DB 에서 막고, 도메인에서도 같은 규칙을 지킨다.
CREATE TABLE admin_fee_audit_comment (
    id              BIGSERIAL PRIMARY KEY,
    club_id         BIGINT       NOT NULL REFERENCES club (id),
    author_user_id  BIGINT       NOT NULL REFERENCES users (id),
    kind            VARCHAR(20)  NOT NULL,
    status          VARCHAR(20),
    content         VARCHAR(2000) NOT NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP,
    CONSTRAINT chk_fee_audit_comment_kind   CHECK (kind IN ('AUDIT_OPINION', 'OPERATION_MEMO')),
    CONSTRAINT chk_fee_audit_comment_status CHECK (
        (kind = 'AUDIT_OPINION'  AND status IN ('OPEN', 'IN_REVIEW', 'RESOLVED'))
     OR (kind = 'OPERATION_MEMO' AND status IS NULL)
    )
);

-- 동아리 상세의 의견·메모 목록(최신순) 전용.
CREATE INDEX idx_fee_audit_comment_club ON admin_fee_audit_comment (club_id, created_at DESC);

-- 신규 테이블은 RLS 를 켠다(V59 이후 규약, RowLevelSecurityMigrationTest 가 강제).
ALTER TABLE admin_fee_audit_comment ENABLE ROW LEVEL SECURITY;
