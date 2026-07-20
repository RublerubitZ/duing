-- 완료 시 제외된 item 이 예약을 영구히 붙잡는 락아웃 해소 — 제외된 item 은 배치 이력에는 남되
-- 활성 제출(중복 검증·후보 표시)에서는 빠진다. skipped 는 취소가 아니라 "완료 시 제출 대상에서 제외됨"이다.
-- 순수 additive·nullable·기본값 없음 — 구 이미지가 이 컬럼을 몰라도 INSERT/SELECT 가 깨지지 않아 롤백 안전하다.
ALTER TABLE facility_submission_item
    ADD COLUMN skipped_at TIMESTAMP;

-- 백필하지 않는다: 기존 행의 스킵 여부는 booking 현재 상태로 추론할 수밖에 없는데,
-- 그 추론은 "이미 확정된 예약을 스킵으로 오인 → 중복 제출 허용" 위험을 낳는다.
-- 프로덕션 미배포라 대상 데이터도 없으므로 NULL(= 활성) 유지가 안전한 기본값이다.
