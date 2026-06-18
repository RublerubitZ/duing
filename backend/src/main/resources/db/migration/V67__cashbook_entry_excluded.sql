-- 항목 집계 제외 플래그. true 면 총수입·총지출·장부 잔액 집계에서 제외(원본은 보존).
ALTER TABLE cashbook_entry ADD COLUMN excluded BOOLEAN NOT NULL DEFAULT FALSE;
