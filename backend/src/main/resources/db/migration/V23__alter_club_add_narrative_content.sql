-- 동아리 소개 탭 서술형 콘텐츠 3종 (모두 nullable, highlights 만 빈 배열 기본).
ALTER TABLE club ADD COLUMN IF NOT EXISTS tagline VARCHAR(60);
ALTER TABLE club ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE club ADD COLUMN IF NOT EXISTS major_projects TEXT;
