-- V45 에서 생성된 UNIQUE (application_id, slot_id) 는 soft delete 와 충돌한다.
-- 동일 (application_id, slot_id) 쌍이 삭제 후 재삽입될 때 중복 제약 위반이 발생하므로,
-- deleted_at IS NULL 인 행에만 적용되는 부분 유니크 인덱스로 교체한다.

ALTER TABLE interview_availability
    DROP CONSTRAINT IF EXISTS interview_availability_application_id_slot_id_key;

CREATE UNIQUE INDEX uq_interview_availability_active
    ON interview_availability (application_id, slot_id)
    WHERE deleted_at IS NULL;
