-- Migration for dynamic agent system
-- This table stores custom agent configurations

CREATE TABLE IF NOT EXISTS quorum_agents (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL UNIQUE,
  config JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_quorum_agents_name ON quorum_agents(name);
CREATE INDEX IF NOT EXISTS idx_quorum_agents_enabled ON quorum_agents(enabled);

-- Comments
COMMENT ON TABLE quorum_agents IS 'Dynamic agent configurations - stores custom agents and overrides for built-in agents';
COMMENT ON COLUMN quorum_agents.name IS 'Unique agent identifier (e.g., "connector", "custom-researcher")';
COMMENT ON COLUMN quorum_agents.config IS 'Full agent configuration including specialties, capabilities, prompts, etc.';
COMMENT ON COLUMN quorum_agents.enabled IS 'Whether this agent is active and should be included in discovery';
