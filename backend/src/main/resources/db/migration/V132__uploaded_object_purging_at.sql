-- 업로드 파기 24시간 유예(#1258). UploadPurgeJob 이 claim(PURGING)한 시각을 기록하고, 실삭제는 이 시각 + grace
-- 이후 실행에서만 한다 — R2 는 버전 관리가 없어 오판 삭제를 되돌릴 수 없으므로, 유예 사이 참조가 생기면 다음 실행의
-- 참조 스캔이 ACTIVE 로 되돌린다. nullable 추가라 롤백 안전(이전 이미지는 컬럼을 무시한다). 기존 PURGING 행은 NULL 이며
-- 다음 claim 에서 기록된다.
ALTER TABLE uploaded_object ADD COLUMN IF NOT EXISTS purging_at TIMESTAMP WITH TIME ZONE;
