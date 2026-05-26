ALTER TABLE club
    ADD COLUMN rejection_reason  VARCHAR(500),
    ADD COLUMN central_club      BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN status_changed_by BIGINT REFERENCES users(id),
    ADD COLUMN status_changed_at TIMESTAMP;
