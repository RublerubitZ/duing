-- 동아리 프로필 리디자인 — 대표 연락처 공개 범위 · 회비 구조화 · 프로젝트 카드 · SNS 4종 개편.
-- contact_email / membership_fee / major_projects 는 논리 제거(API 미사용) — 컬럼 drop 은 후속 마이그레이션.
ALTER TABLE club ADD COLUMN IF NOT EXISTS contact_visibility VARCHAR(20) NOT NULL DEFAULT 'PUBLIC';
ALTER TABLE club ADD COLUMN IF NOT EXISTS membership_fee_amount INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS fee_cycle VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE club ADD COLUMN IF NOT EXISTS projects JSONB NOT NULL DEFAULT '[]'::jsonb;

-- NONE ⇔ 금액 없음 (양방향), 금액은 양수 (스펙 §3.2)
ALTER TABLE club ADD CONSTRAINT chk_club_fee_cycle_amount
    CHECK ((fee_cycle = 'NONE') = (membership_fee_amount IS NULL));
ALTER TABLE club ADD CONSTRAINT chk_club_fee_amount_positive
    CHECK (membership_fee_amount IS NULL OR membership_fee_amount > 0);

-- 기존 X / YOUTUBE / WEB 플랫폼을 OTHER + label 로 보존 변환 (스펙 §3.3)
UPDATE club
SET sns_links = (
    SELECT COALESCE(jsonb_agg(
        CASE
            WHEN element->>'platform' = 'X'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"X"')
            WHEN element->>'platform' = 'YOUTUBE'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"YouTube"')
            WHEN element->>'platform' = 'WEB'
                THEN jsonb_set(jsonb_set(element, '{platform}', '"OTHER"'), '{label}', '"Website"')
            ELSE element
        END ORDER BY ordinality), '[]'::jsonb)
    FROM jsonb_array_elements(sns_links) WITH ORDINALITY AS entries(element, ordinality)
)
WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements(sns_links) AS entries(element)
    WHERE element->>'platform' IN ('X', 'YOUTUBE', 'WEB')
);
