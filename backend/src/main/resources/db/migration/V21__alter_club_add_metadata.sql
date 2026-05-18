-- 동아리 표시용 스칼라 메타데이터 컬럼 추가 (모두 nullable).
ALTER TABLE club ADD COLUMN IF NOT EXISTS founded_year       INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS cohort_number      INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS location           VARCHAR(200);
ALTER TABLE club ADD COLUMN IF NOT EXISTS contact_email      VARCHAR(200);
ALTER TABLE club ADD COLUMN IF NOT EXISTS activity_frequency INTEGER;
ALTER TABLE club ADD COLUMN IF NOT EXISTS active_days        VARCHAR(50);
ALTER TABLE club ADD COLUMN IF NOT EXISTS membership_fee     VARCHAR(100);
