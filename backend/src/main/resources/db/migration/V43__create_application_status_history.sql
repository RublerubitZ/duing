-- V43__create_application_status_history.sql
-- 상태 전이 audit log. append-only.
-- previous_status / new_status: SUBMITTED 진입은 기록하지 않으므로 둘 다 NOT NULL.
-- deleted_at 컬럼은 BaseEntity 일관성 때문에 남기되 항상 NULL (엔티티에서 hard/soft delete 모두 막음).

CREATE TABLE IF NOT EXISTS application_status_history (
    id              BIGSERIAL PRIMARY KEY,
    application_id  BIGINT      NOT NULL REFERENCES application (id),
    previous_status VARCHAR(20) NOT NULL,
    new_status      VARCHAR(20) NOT NULL,
    changed_by      BIGINT      NOT NULL REFERENCES users (id),
    created_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_status_history_application
    ON application_status_history (application_id, created_at);
