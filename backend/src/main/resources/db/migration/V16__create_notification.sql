CREATE TABLE notification (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(120) NOT NULL,
  body       VARCHAR(300) NOT NULL,
  link_url   VARCHAR(300),
  payload    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  dedup_key  VARCHAR(160) NOT NULL,
  read_at    TIMESTAMP,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_notification_dedup UNIQUE (user_id, dedup_key)
);