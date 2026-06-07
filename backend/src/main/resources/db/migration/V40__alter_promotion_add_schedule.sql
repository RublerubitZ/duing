-- promotion: 기간 노출 지원 (NULL=상시).
ALTER TABLE promotion
    ADD COLUMN start_at TIMESTAMP,
    ADD COLUMN end_at   TIMESTAMP;

-- start_at < end_at 보장. 한쪽만 NULL 인 케이스(시작만 / 종료만) 는 허용.
ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_schedule_range
    CHECK (start_at IS NULL OR end_at IS NULL OR start_at < end_at);

-- 공개 피드 필터(active + 기간) 가속용 인덱스.
DROP INDEX IF EXISTS idx_promo_public_feed;
CREATE INDEX idx_promo_public_feed
    ON promotion (active, display_order ASC, created_at DESC)
    WHERE deleted_at IS NULL;
