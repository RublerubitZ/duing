CREATE INDEX idx_notification_user_created
  ON notification (user_id, created_at DESC);

CREATE INDEX idx_notification_user_unread
  ON notification (user_id) WHERE read_at IS NULL;