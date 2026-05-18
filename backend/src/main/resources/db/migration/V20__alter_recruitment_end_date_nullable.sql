-- 상시모집(end_date 없음)을 표현할 수 있도록 NOT NULL 제약을 제거한다.
ALTER TABLE recruitment ALTER COLUMN end_date DROP NOT NULL;