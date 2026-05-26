-- recertification_round: 재인증 라운드
CREATE TABLE recertification_round (
    id          BIGSERIAL    PRIMARY KEY,
    year        INT          NOT NULL,
    label       VARCHAR(100) NOT NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'OPEN',
    opened_by   BIGINT       NOT NULL REFERENCES users(id),
    opened_at   TIMESTAMP    NOT NULL,
    closed_by   BIGINT       REFERENCES users(id),
    closed_at   TIMESTAMP,
    deleted_at  TIMESTAMP,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rr_status     CHECK (status IN ('OPEN','CLOSED')),
    CONSTRAINT chk_rr_close_pair CHECK (
        (status = 'OPEN'   AND closed_by IS NULL     AND closed_at IS NULL) OR
        (status = 'CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_rr_open_per_year
    ON recertification_round (year)
    WHERE status = 'OPEN' AND deleted_at IS NULL;

CREATE INDEX idx_rr_year_desc ON recertification_round (year DESC)
    WHERE deleted_at IS NULL;

-- recertification_request: 동아리별 재인증 제출
CREATE TABLE recertification_request (
    id              BIGSERIAL    PRIMARY KEY,
    round_id        BIGINT       NOT NULL REFERENCES recertification_round(id),
    club_id         BIGINT       NOT NULL REFERENCES club(id),
    leader_user_id  BIGINT       NOT NULL REFERENCES users(id),
    contact_email   VARCHAR(255) NOT NULL,
    contact_phone   VARCHAR(40)  NOT NULL,
    operating_year  INT          NOT NULL,
    notes           TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note     TEXT,
    handled_by      BIGINT       REFERENCES users(id),
    handled_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_rcr_status         CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT chk_rcr_notes_len      CHECK (notes IS NULL OR char_length(notes) <= 2000),
    CONSTRAINT chk_rcr_action_len     CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_rcr_handled_pair   CHECK (
        (status = 'PENDING' AND handled_by IS NULL     AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_rcr_active_pending
    ON recertification_request (round_id, club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_rcr_admin_feed
    ON recertification_request (round_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_rcr_club_recent
    ON recertification_request (club_id, created_at DESC)
    WHERE deleted_at IS NULL;

-- club: last_verified_year
ALTER TABLE club ADD COLUMN last_verified_year INT;
