-- V14__create_club_favorite.sql
CREATE TABLE club_favorite (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  club_id    BIGINT       NOT NULL REFERENCES club(id)  ON DELETE CASCADE,
  created_at TIMESTAMP    NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_club_favorite UNIQUE (user_id, club_id)
);

CREATE INDEX idx_club_favorite_user_created ON club_favorite (user_id, created_at DESC);
CREATE INDEX idx_club_favorite_club         ON club_favorite (club_id);
