-- V15__create_application_draft.sql
CREATE TABLE application_draft (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        BIGINT       NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
  recruitment_id BIGINT       NOT NULL REFERENCES recruitment(id) ON DELETE CASCADE,
  answers        JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_application_draft UNIQUE (user_id, recruitment_id)
);

CREATE INDEX idx_application_draft_recruitment ON application_draft (recruitment_id);