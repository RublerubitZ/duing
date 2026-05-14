CREATE TABLE IF NOT EXISTS recruitment (
    id         BIGSERIAL PRIMARY KEY,
    club_id    BIGINT       NOT NULL REFERENCES club (id),
    title      VARCHAR(200) NOT NULL,
    content    TEXT,
    start_date DATE         NOT NULL,
    end_date   DATE         NOT NULL,
    capacity   INT          NOT NULL CHECK (capacity > 0),
    status     VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP    NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP,
    CONSTRAINT chk_recruitment_period CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_recruitment_club        ON recruitment (club_id);
CREATE INDEX IF NOT EXISTS idx_recruitment_status      ON recruitment (status);
CREATE INDEX IF NOT EXISTS idx_recruitment_period      ON recruitment (start_date, end_date);