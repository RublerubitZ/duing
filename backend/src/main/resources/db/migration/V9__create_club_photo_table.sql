-- 동아리 활동사진. 표시 순서는 display_order 오름차순.
-- storage_key 는 FileStorageService 가 발급하는 식별자 (Supabase Storage 의 object path).
CREATE TABLE IF NOT EXISTS club_photo (
    id            BIGSERIAL PRIMARY KEY,
    club_id       BIGINT       NOT NULL REFERENCES club (id),
    storage_key   VARCHAR(500) NOT NULL,
    caption       VARCHAR(200),
    width         INT,
    height        INT,
    display_order INT          NOT NULL DEFAULT 0,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_photo_club_order
    ON club_photo (club_id, display_order)
    WHERE deleted_at IS NULL;
