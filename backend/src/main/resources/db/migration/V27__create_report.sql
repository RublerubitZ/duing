-- report: 동아리/모집공고 신고 접수 + ADMIN 처리 기록
CREATE TABLE report (
    id            BIGSERIAL    PRIMARY KEY,
    reporter_id   BIGINT       NOT NULL REFERENCES users(id),
    target_type   VARCHAR(30)  NOT NULL,
    target_id     BIGINT       NOT NULL,
    reason_code   VARCHAR(30)  NOT NULL,
    detail        TEXT,
    status        VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note   TEXT,
    handled_by    BIGINT       REFERENCES users(id),
    handled_at    TIMESTAMP,
    deleted_at    TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_report_target_type CHECK (target_type IN ('CLUB','RECRUITMENT')),
    CONSTRAINT chk_report_reason_code CHECK (
        reason_code IN ('SPAM','FRAUD','INAPPROPRIATE','IMPERSONATION','OTHER')
    ),
    CONSTRAINT chk_report_status      CHECK (status IN ('PENDING','RESOLVED','DISMISSED')),
    CONSTRAINT chk_report_detail_len  CHECK (detail IS NULL OR char_length(detail) <= 1000),
    CONSTRAINT chk_report_action_note_len CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_report_handled_pair CHECK (
        (status = 'PENDING' AND handled_by IS NULL AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_report_active_pending
    ON report (reporter_id, target_type, target_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_report_admin_feed
    ON report (status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX idx_report_target
    ON report (target_type, target_id)
    WHERE deleted_at IS NULL;
