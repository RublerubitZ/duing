-- 총동아리연합회(총동연) FAQ. 카테고리는 enum이 아닌 테이블 — 관리 주체가 개발팀이 아닌
-- 총동연(비개발자·매년 교체)이라 무배포 개편이 요구사항. (스펙 2026-07-04-federation-qna-design §4)
CREATE TABLE federation_faq_category (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(50) NOT NULL,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE
);
CREATE UNIQUE INDEX uq_federation_faq_category_name
    ON federation_faq_category (name) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq_category ENABLE ROW LEVEL SECURITY;

CREATE TABLE federation_faq (
    id           BIGSERIAL PRIMARY KEY,
    category_id  BIGINT NOT NULL REFERENCES federation_faq_category (id),
    question     VARCHAR(300) NOT NULL,
    answer       TEXT NOT NULL,               -- Markdown
    is_pinned    BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order   INT NOT NULL DEFAULT 0,
    view_count   BIGINT NOT NULL DEFAULT 0,   -- 증가 로직은 P2 (POST /view)
    author_id    BIGINT NOT NULL REFERENCES users (id),
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_federation_faq_answer_length CHECK (char_length(answer) <= 4000)
);
CREATE INDEX idx_federation_faq_public
    ON federation_faq (is_published, is_pinned DESC, sort_order, id DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_federation_faq_category
    ON federation_faq (category_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_faq ENABLE ROW LEVEL SECURITY;

-- 초기 카테고리 시드 — 이름·순서는 총동연이 admin 화면(P1-PR2)에서 변경 가능.
INSERT INTO federation_faq_category (name, sort_order) VALUES
    ('동아리 등록', 0),
    ('모집·행사', 1),
    ('지원사업·예산', 2),
    ('시설 이용', 3),
    ('기타', 4);
