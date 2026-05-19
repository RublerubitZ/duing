-- notice_broadcast: PUBLIC 공지 + notify_on_publish=true 전용 가상 알림 projection
CREATE TABLE notice_broadcast (
    id          BIGSERIAL    PRIMARY KEY,
    notice_id   BIGINT       NOT NULL UNIQUE REFERENCES notice(id) ON DELETE CASCADE,
    title       VARCHAR(120) NOT NULL,
    body        VARCHAR(300) NOT NULL,
    link_url    VARCHAR(300),
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notice_broadcast_created
    ON notice_broadcast (created_at DESC)
    WHERE deleted_at IS NULL;

-- notice_broadcast_read: 사용자별 broadcast 읽음 마킹
CREATE TABLE notice_broadcast_read (
    broadcast_id BIGINT    NOT NULL REFERENCES notice_broadcast(id) ON DELETE CASCADE,
    user_id      BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (broadcast_id, user_id)
);

CREATE INDEX idx_notice_broadcast_read_user
    ON notice_broadcast_read (user_id, broadcast_id);
