CREATE TABLE IF NOT EXISTS application (
    id             BIGSERIAL PRIMARY KEY,
    recruitment_id BIGINT      NOT NULL REFERENCES recruitment (id),
    user_id        BIGINT      NOT NULL REFERENCES users (id),
    answers        JSONB       NOT NULL DEFAULT '[]'::jsonb,
    status         VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED',
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_application_recruitment ON application (recruitment_id);
CREATE INDEX IF NOT EXISTS idx_application_user        ON application (user_id);
CREATE INDEX IF NOT EXISTS idx_application_status      ON application (status);
