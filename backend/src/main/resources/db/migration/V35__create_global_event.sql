-- global_event: 학교 단위 행사 일정 (ADMIN 만 작성)
CREATE TABLE global_event (
    id           BIGSERIAL    PRIMARY KEY,
    title        VARCHAR(120) NOT NULL,
    description  TEXT,
    start_at     TIMESTAMP    NOT NULL,
    end_at       TIMESTAMP    NOT NULL,
    location     VARCHAR(200),
    link_url     VARCHAR(500),
    category     VARCHAR(30)  NOT NULL,
    created_by   BIGINT       NOT NULL REFERENCES users(id),
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_global_event_period CHECK (end_at >= start_at)
);

CREATE INDEX idx_global_event_start
    ON global_event (start_at)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_global_event_category_start
    ON global_event (category, start_at)
    WHERE deleted_at IS NULL;
