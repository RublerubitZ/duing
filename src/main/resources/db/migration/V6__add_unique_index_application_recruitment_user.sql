-- (recruitment_id, user_id) 활성 행 기준 유일성 보장.
-- soft delete 를 고려하여 deleted_at IS NULL 인 행에만 제약 적용 (부분 유니크 인덱스).
CREATE UNIQUE INDEX IF NOT EXISTS uk_application_recruitment_user_active
    ON application (recruitment_id, user_id)
    WHERE deleted_at IS NULL;
