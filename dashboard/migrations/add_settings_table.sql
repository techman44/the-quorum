-- Migration for quorum_settings table
-- This table stores key-value settings for the Quorum system

CREATE TABLE IF NOT EXISTS quorum_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_quorum_settings_updated_at ON quorum_settings(updated_at);

-- Comment
COMMENT ON TABLE quorum_settings IS 'System-wide settings stored as key-value pairs';
COMMENT ON COLUMN quorum_settings.key IS 'Unique setting identifier';
COMMENT ON COLUMN quorum_settings.value IS 'Setting value (JSON format)';
COMMENT ON COLUMN quorum_settings.description IS 'Human-readable description of the setting';
COMMENT ON COLUMN quorum_settings.updated_at IS 'Last update timestamp';
