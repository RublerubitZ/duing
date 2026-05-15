-- 면접 일정 안내용.
-- INTERVIEW_PENDING 상태에서 운영진이 채우고, 학생은 본인 지원 상세에서 확인.
-- ApplicationStatus 의 UNDER_REVIEW / INTERVIEW_PENDING 값 추가는 VARCHAR 컬럼이므로 DDL 변경 불필요.
ALTER TABLE application ADD COLUMN IF NOT EXISTS interview_at       TIMESTAMP;
ALTER TABLE application ADD COLUMN IF NOT EXISTS interview_location VARCHAR(200);
