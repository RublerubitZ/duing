-- 제출 배치 동아리 단위 전환(v2 스펙 §1~§2) — 신규 배치는 club_id, 기존(시설 단위) 배치는 facility_id 를 유지한다.
ALTER TABLE facility_submission_batch ADD COLUMN club_id BIGINT REFERENCES club (id);
ALTER TABLE facility_submission_batch ALTER COLUMN facility_id DROP NOT NULL;
ALTER TABLE facility_submission_batch ADD CONSTRAINT facility_submission_batch_scope_check
    CHECK (club_id IS NOT NULL OR facility_id IS NOT NULL);
