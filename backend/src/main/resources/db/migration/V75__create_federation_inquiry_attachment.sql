-- 총동연 1:1 비밀문의 첨부 이미지.
-- storage_key 는 공개 URL 이 아닌 스토리지 키 — 비밀성: URL 은 응답에 절대 노출하지 않고,
-- 인증 프록시 다운로드(작성자 or ADMIN)로만 원본 바이트에 접근한다.
-- (계획서 2026-07-06-federation-inquiry-attachments §Architecture)
CREATE TABLE federation_inquiry_attachment (
    id           BIGSERIAL PRIMARY KEY,
    inquiry_id   BIGINT       NOT NULL REFERENCES federation_inquiry (id),
    answer_id    BIGINT       REFERENCES federation_inquiry_answer (id),  -- 답변 측 첨부 슬롯(후속)
    storage_key  VARCHAR(500) NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size    BIGINT       NOT NULL,
    sort_order   INT          NOT NULL DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMP WITH TIME ZONE
);
CREATE INDEX idx_fed_inquiry_attachment_inquiry
    ON federation_inquiry_attachment (inquiry_id) WHERE deleted_at IS NULL;
ALTER TABLE federation_inquiry_attachment ENABLE ROW LEVEL SECURITY;
