-- 학교 제출 완료 처리(스펙 v2.1 §2·§4.3) — Batch 상태 3종(검토 중/제출 완료/취소) 상호 배타.
ALTER TABLE facility_submission_batch
    ADD COLUMN completed_at TIMESTAMP,
    ADD COLUMN completed_by BIGINT REFERENCES users (id);

-- 사람이 읽는 감사 요약(COMPLETED 전용, 기존 이벤트는 NULL) — auth_event.detail 전례(500·절단 내장)
ALTER TABLE facility_submission_audit
    ADD COLUMN detail VARCHAR(500);
