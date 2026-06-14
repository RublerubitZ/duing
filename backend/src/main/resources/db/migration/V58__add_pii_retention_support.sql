-- PIPA 보관기간 만료 PII 익명화 잡 지원.
-- anonymized_at: 익명화 완료 행을 표시해 재실행 시 건너뛰고(멱등) 처리 시점을 감사한다.
ALTER TABLE users ADD COLUMN anonymized_at TIMESTAMP;

-- 보관기간 스캔(soft-delete 된 행 중 cutoff 경과분)의 부분 인덱스 — 활성 행은 인덱스에서 제외.
CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_application_deleted_at ON application (deleted_at) WHERE deleted_at IS NOT NULL;
