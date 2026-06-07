-- V44__create_application_evaluation.sql
-- 운영진 1인당 1개 평가 (application_id, evaluator_id) partial unique (active rows only).
-- soft delete 후 재작성 허용.

CREATE TABLE IF NOT EXISTS application_evaluation (
    id             BIGSERIAL PRIMARY KEY,
    application_id BIGINT      NOT NULL REFERENCES application (id),
    evaluator_id   BIGINT      NOT NULL REFERENCES users (id),
    score          INTEGER     NOT NULL CHECK (score BETWEEN 1 AND 5),
    memo           TEXT,
    created_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP   NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_application_evaluation_active
    ON application_evaluation (application_id, evaluator_id)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_application_evaluation_application
    ON application_evaluation (application_id);
