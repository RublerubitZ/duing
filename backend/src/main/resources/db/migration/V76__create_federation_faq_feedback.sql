-- 총동연 FAQ "이 답변이 도움이 되었나요?" 피드백. 로그인=user_id, 비로그인=session_key 로 식별자당
-- 1건 — 재제출은 값 갱신(upsert)이라 삭제 이력이 없다(deleted_at 은 BaseEntity 매핑용으로만 존재,
-- @SQLDelete 는 미사용). 집계는 admin FAQ 관리 화면 전용 참고 신호(스펙 2026-07-06-federation-faq-helpful).
CREATE TABLE federation_faq_feedback (
    id          BIGSERIAL PRIMARY KEY,
    faq_id      BIGINT      NOT NULL REFERENCES federation_faq (id),
    user_id     BIGINT      REFERENCES users (id),
    session_key VARCHAR(64),
    helpful     BOOLEAN     NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP WITH TIME ZONE,
    CONSTRAINT chk_fff_identity CHECK (user_id IS NOT NULL OR session_key IS NOT NULL)
);
CREATE UNIQUE INDEX uq_fff_faq_user ON federation_faq_feedback (faq_id, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX uq_fff_faq_session ON federation_faq_feedback (faq_id, session_key) WHERE user_id IS NULL AND session_key IS NOT NULL;
ALTER TABLE federation_faq_feedback ENABLE ROW LEVEL SECURITY;
