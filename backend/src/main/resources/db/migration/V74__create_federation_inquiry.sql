-- 총동연 1:1 비밀문의. 작성자와 총동연(ADMIN)만 열람 — 애플리케이션 레이어에서 통제.
-- (스펙 2026-07-04-federation-qna-design §4)
CREATE TABLE federation_inquiry (
    id            BIGSERIAL PRIMARY KEY,
    author_id     BIGINT NOT NULL REFERENCES users (id),
    title         VARCHAR(120) NOT NULL,
    content       TEXT NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'RECEIVED',
    answered_at   TIMESTAMP WITH TIME ZONE,
    closed_at     TIMESTAMP WITH TIME ZONE,
    closed_reason VARCHAR(200),
    version       BIGINT NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_status
        CHECK (status IN ('RECEIVED', 'IN_PROGRESS', 'ANSWERED', 'CLOSED')),
    CONSTRAINT chk_federation_inquiry_status_pair
        CHECK ((status <> 'ANSWERED' OR answered_at IS NOT NULL)
           AND (status <> 'CLOSED' OR closed_at IS NOT NULL)),
    CONSTRAINT chk_federation_inquiry_content_length CHECK (char_length(content) <= 2000)
);
CREATE INDEX idx_federation_inquiry_author
    ON federation_inquiry (author_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_inquiry_status
    ON federation_inquiry (status, created_at DESC) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_inquiry_answer (
    id          BIGSERIAL PRIMARY KEY,
    inquiry_id  BIGINT NOT NULL REFERENCES federation_inquiry (id),
    content     TEXT NOT NULL,
    answered_by BIGINT NOT NULL REFERENCES users (id),  -- 학생 응답엔 비노출
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_inquiry_answer_length CHECK (char_length(content) <= 4000)
);
-- 이중 답변 DB 백스톱 (1:1 강제, 스레드 확장 시 이 인덱스만 제거)
CREATE UNIQUE INDEX uq_federation_inquiry_answer
    ON federation_inquiry_answer (inquiry_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry_answer ENABLE ROW LEVEL SECURITY;
