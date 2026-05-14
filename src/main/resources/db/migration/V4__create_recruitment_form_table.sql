CREATE TABLE IF NOT EXISTS recruitment_form (
    id             BIGSERIAL PRIMARY KEY,
    recruitment_id BIGINT    NOT NULL UNIQUE REFERENCES recruitment (id),
    questions      JSONB     NOT NULL DEFAULT '[]'::jsonb,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);
