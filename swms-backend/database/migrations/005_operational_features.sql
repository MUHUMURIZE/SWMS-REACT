BEGIN;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS category VARCHAR(64),
  ADD COLUMN IF NOT EXISTS priority VARCHAR(16) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(64),
  ADD COLUMN IF NOT EXISTS resource_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (category);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications (priority);

ALTER TABLE collections
  ADD COLUMN IF NOT EXISTS original_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rescheduled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_collections_rescheduled ON collections (rescheduled_at);

COMMIT;
