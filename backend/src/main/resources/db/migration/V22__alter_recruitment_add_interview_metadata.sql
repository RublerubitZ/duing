-- 모집 공고에 면접 일정 및 지원자 수 공개 토글 컬럼 추가.
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS interview_start_date DATE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS interview_end_date   DATE;
ALTER TABLE recruitment ADD COLUMN IF NOT EXISTS show_applicant_count BOOLEAN NOT NULL DEFAULT FALSE;
