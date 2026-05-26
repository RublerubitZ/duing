-- promotion_request: 동아리(LEADER/OFFICER) → ADMIN 홍보 요청
CREATE TABLE promotion_request (
    id                          BIGSERIAL    PRIMARY KEY,
    club_id                     BIGINT       NOT NULL REFERENCES club(id),
    requester_user_id           BIGINT       NOT NULL REFERENCES users(id),
    title                       VARCHAR(80)  NOT NULL,
    description                 TEXT         NOT NULL,
    suggested_banner_image_url  VARCHAR(500),
    suggested_link_url          TEXT,
    status                      VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
    action_note                 TEXT,
    handled_by                  BIGINT       REFERENCES users(id),
    handled_at                  TIMESTAMP,
    deleted_at                  TIMESTAMP,
    created_at                  TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_pr_status            CHECK (status IN ('PENDING','ACCEPTED','REJECTED')),
    CONSTRAINT chk_pr_description_len   CHECK (char_length(description) <= 2000),
    CONSTRAINT chk_pr_link_len          CHECK (suggested_link_url IS NULL OR char_length(suggested_link_url) <= 2000),
    CONSTRAINT chk_pr_action_note_len   CHECK (action_note IS NULL OR char_length(action_note) <= 1000),
    CONSTRAINT chk_pr_handled_pair      CHECK (
        (status = 'PENDING' AND handled_by IS NULL     AND handled_at IS NULL) OR
        (status <> 'PENDING' AND handled_by IS NOT NULL AND handled_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_pr_active_pending
    ON promotion_request (club_id)
    WHERE status = 'PENDING' AND deleted_at IS NULL;

CREATE INDEX idx_pr_admin_feed
    ON promotion_request (status, created_at DESC)
    WHERE deleted_at IS NULL;

-- promotion: ADMIN 큐레이션 배너
CREATE TABLE promotion (
    id                BIGSERIAL    PRIMARY KEY,
    club_id           BIGINT       REFERENCES club(id),
    title             VARCHAR(120) NOT NULL,
    banner_image_url  VARCHAR(500) NOT NULL,
    link_url          TEXT,
    active            BOOLEAN      NOT NULL DEFAULT FALSE,
    display_order     INT          NOT NULL DEFAULT 0,
    created_by        BIGINT       NOT NULL REFERENCES users(id),
    deleted_at        TIMESTAMP,
    created_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_promo_link_len CHECK (link_url IS NULL OR char_length(link_url) <= 2000)
);

CREATE INDEX idx_promo_public_feed
    ON promotion (active, display_order ASC, created_at DESC)
    WHERE deleted_at IS NULL;