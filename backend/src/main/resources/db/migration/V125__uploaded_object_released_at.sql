-- #1153 교체·삭제로 해제된(RELEASED) 업로드 객체의 해제 시각. 상태 값 RELEASED 는 VARCHAR(20) 컬럼이라 DDL 이 필요 없다.
ALTER TABLE uploaded_object ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE;
-- 해제 후보 스캔(status = 'RELEASED' AND released_at < cutoff ORDER BY id) 전용. PENDING 쪽은 기존 (status, uploaded_at).
CREATE INDEX IF NOT EXISTS idx_uploaded_object_status_released_at ON uploaded_object (status, released_at);
