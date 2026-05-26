-- leader_succession_request: 잠수 LEADER 대상 승계 요청
CREATE TABLE leader_succession_request (
    id                  BIGSERIAL    PRIMARY KEY,
    club_id             BIGINT       NOT NULL REFERENCES club(id),
    requester_user_id   BIGINT       NOT NULL REFERENCES users(id),
    reason              TEXT         NOT NULL,
    status              VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note         TEXT,
    handled_by          BIGINT       REFERENCES users(id),
    handled_at          TIMESTAMP,
    deleted_at          TIMESTAMP,
    created_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_lsr_status        CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    CONSTRAINT chk_lsr_reason_len    CHECK (char_length(reason) <= 1000),
    CONSTRAINT chk_lsr_action_len    CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_lsr_handled_pair  CHECK (
        (status = 'PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_lsr_active_pending
    ON leader_succession_request (club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_lsr_admin_feed
    ON leader_succession_request (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- club_member_history: 권한 변경 감사 로그
CREATE TABLE club_member_history (
    id              BIGSERIAL    PRIMARY KEY,
    club_id         BIGINT       NOT NULL,
    target_user_id  BIGINT       NOT NULL,
    actor_user_id   BIGINT       NOT NULL,
    event_type      VARCHAR(40)  NOT NULL,
    from_role       VARCHAR(20),
    to_role         VARCHAR(20),
    reason          TEXT,
    deleted_at      TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_cmh_event_type CHECK (event_type IN (
        'ROLE_CHANGED','LEADER_TRANSFERRED','LEFT','REMOVED',
        'ADMIN_LEADER_ASSIGNED','SUCCESSION_APPROVED'
    )),
    CONSTRAINT chk_cmh_from_role CHECK (from_role IS NULL OR from_role IN ('LEADER','OFFICER','MEMBER')),
    CONSTRAINT chk_cmh_to_role   CHECK (to_role   IS NULL OR to_role   IN ('LEADER','OFFICER','MEMBER')),
    CONSTRAINT chk_cmh_reason_len CHECK (reason IS NULL OR char_length(reason) <= 1000)
);

CREATE INDEX idx_cmh_club_recent ON club_member_history (club_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_cmh_target_recent ON club_member_history (target_user_id, created_at DESC)
    WHERE deleted_at IS NULL;
