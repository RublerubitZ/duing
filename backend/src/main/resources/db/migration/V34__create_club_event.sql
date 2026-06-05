-- club_event: 동아리 일정
CREATE TABLE club_event (
    id           BIGSERIAL    PRIMARY KEY,
    club_id      BIGINT       NOT NULL REFERENCES club(id),
    title        VARCHAR(120) NOT NULL,
    description  TEXT,
    start_at     TIMESTAMP    NOT NULL,
    end_at       TIMESTAMP    NOT NULL,
    location     VARCHAR(200),
    created_by   BIGINT       NOT NULL REFERENCES users(id),
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_club_event_period CHECK (end_at >= start_at)
);

CREATE INDEX idx_club_event_club_start
    ON club_event (club_id, start_at)
    WHERE deleted_at IS NULL;
