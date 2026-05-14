CREATE TABLE IF NOT EXISTS club (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    category    VARCHAR(30)  NOT NULL,
    division    VARCHAR(50),
    description TEXT,
    logo_url    VARCHAR(500),
    leader_id   BIGINT       REFERENCES users (id),
    status      VARCHAR(30)  NOT NULL DEFAULT 'PENDING_APPROVAL',
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_club_category ON club (category);
CREATE INDEX IF NOT EXISTS idx_club_status   ON club (status);
CREATE INDEX IF NOT EXISTS idx_club_leader   ON club (leader_id);