-- promotion: 공지 연결 지원. link_url / notice_id / club_id 중 ≤1 만 set.

ALTER TABLE promotion
    ADD COLUMN notice_id BIGINT REFERENCES notice(id);

ALTER TABLE promotion
    ADD CONSTRAINT chk_promo_single_link CHECK (
        (CASE WHEN link_url IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN notice_id IS NOT NULL THEN 1 ELSE 0 END)
      + (CASE WHEN club_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
    );

-- 어드민 목록 / 공개 피드의 notice JOIN 가속.
CREATE INDEX idx_promo_notice_id ON promotion (notice_id)
    WHERE notice_id IS NOT NULL AND deleted_at IS NULL;
