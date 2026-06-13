ALTER TABLE notice
    ADD COLUMN event_start_at  TIMESTAMP    NULL,
    ADD COLUMN event_end_at    TIMESTAMP    NULL,
    ADD COLUMN location        VARCHAR(200) NULL,
    ADD COLUMN host            VARCHAR(200) NULL,
    ADD COLUMN audience        VARCHAR(200) NULL,
    ADD COLUMN body_image_urls TEXT[]       NOT NULL DEFAULT '{}';
