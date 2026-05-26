-- notice: 총동연 공지 콘텐츠
CREATE TABLE notice (
    id                 BIGSERIAL    PRIMARY KEY,
    title              VARCHAR(120) NOT NULL,
    summary            VARCHAR(300) NOT NULL,
    content            TEXT         NOT NULL,
    cover_image_url    VARCHAR(500) NOT NULL,
    link_url           TEXT,
    category           VARCHAR(30)  NOT NULL,
    tags               TEXT[]       NOT NULL DEFAULT '{}',
    visibility         VARCHAR(30)  NOT NULL,
    club_scope_role    VARCHAR(30),
    is_pinned          BOOLEAN      NOT NULL DEFAULT FALSE,
    expires_at         TIMESTAMP,
    notify_on_publish  BOOLEAN      NOT NULL DEFAULT FALSE,
    author_id          BIGINT       NOT NULL REFERENCES users(id),
    deleted_at         TIMESTAMP,
    created_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_notice_visibility CHECK (visibility IN ('PUBLIC','OFFICERS_ALL','CLUB_SCOPED')),
    CONSTRAINT chk_notice_category   CHECK (category   IN ('FESTIVAL','FAIR','FUNDING','CONTEST','GENERAL')),
    CONSTRAINT chk_notice_club_scope_role CHECK (
        club_scope_role IS NULL OR club_scope_role IN ('OFFICERS_ONLY','ALL_MEMBERS')
    ),
    CONSTRAINT chk_notice_scope_role_pair CHECK (
        (visibility = 'CLUB_SCOPED' AND club_scope_role IS NOT NULL) OR
        (visibility <> 'CLUB_SCOPED' AND club_scope_role IS NULL)
    )
);

CREATE INDEX idx_notice_feed
    ON notice (visibility, is_pinned DESC, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX idx_notice_category ON notice (category);
CREATE INDEX idx_notice_tags     ON notice USING GIN (tags);

-- notice_target_club: CLUB_SCOPED 공지의 대상 클럽 join
CREATE TABLE notice_target_club (
    notice_id  BIGINT NOT NULL REFERENCES notice(id) ON DELETE CASCADE,
    club_id    BIGINT NOT NULL REFERENCES club(id) ON DELETE CASCADE,
    PRIMARY KEY (notice_id, club_id)
);

CREATE INDEX idx_notice_target_club_lookup
    ON notice_target_club (club_id, notice_id);
