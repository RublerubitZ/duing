-- 업로드 객체 추적 테이블 (#791). POST /api/v1/files 가 저장한 객체를 PENDING 으로 기록하고, 엔티티에 연결되는
-- 순간 ACTIVE 로 바꾼다. 24시간 넘게 PENDING 인 객체는 UploadPurgeJob 이 스토리지에서 지운다(PURGING → PURGED).
--
-- storage_key: 공개 URL 이 아닌 스토리지 키({purpose 디렉터리}/{UUID}.{ext}) — publicBaseUrl 이 바뀌어도 추적이 유지된다.
-- uploader_id: FK 없는 id 슬롯(club_view_event 전례) — 남용 계정 추적용. users 는 물리 삭제되지 않는다.
-- 시각 3종은 TIMESTAMPTZ + 엔티티 Instant — prod JVM(UTC)·seoulClock 사이 wall-clock 혼선을 원천 차단한다.
-- PURGED 행은 지우지 않는다 — 행이 있어야 늦은 연결 시도를 "만료된 업로드" 400 으로 구분해 거부할 수 있다
-- (행이 없으면 추적 이전 레거시 객체와 구분이 안 돼 존재하지 않는 URL 이 조용히 저장된다).
CREATE TABLE IF NOT EXISTS uploaded_object (
    id           BIGSERIAL PRIMARY KEY,
    storage_key  VARCHAR(500) NOT NULL,
    purpose      VARCHAR(40)  NOT NULL,
    uploader_id  BIGINT       NOT NULL,
    status       VARCHAR(20)  NOT NULL,
    uploaded_at  TIMESTAMP WITH TIME ZONE NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE,
    purged_at    TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_uploaded_object_storage_key ON uploaded_object (storage_key);
-- 파기 후보 스캔(status IN (PENDING, PURGING) AND uploaded_at < cutoff ORDER BY id) 전용.
CREATE INDEX IF NOT EXISTS idx_uploaded_object_status_uploaded_at ON uploaded_object (status, uploaded_at);

-- 앱은 세션 풀러의 단일 롤로 접근하므로 정책 없이 ENABLE 만으로 외부 직접 접근을 차단한다(전 테이블 공통).
ALTER TABLE uploaded_object ENABLE ROW LEVEL SECURITY;
