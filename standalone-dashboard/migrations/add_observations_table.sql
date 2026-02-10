-- Create quorum_observations table
-- This table stores agent outputs that are not tasks (critiques, risks, insights, recommendations)

CREATE TABLE IF NOT EXISTS quorum_observations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category TEXT NOT NULL CHECK (category IN ('critique', 'risk', 'insight', 'recommendation', 'issue', 'improvement', 'other')),
  content TEXT NOT NULL,
  source_agent TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')) DEFAULT 'info',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'addressed', 'dismissed')),
  ref_id TEXT,
  ref_type TEXT CHECK (ref_type IN ('document', 'task', 'event', 'agent_run', 'observation', NULL)),
  fingerprint TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index on fingerprint for deduplication
CREATE INDEX IF NOT EXISTS idx_quorum_observations_fingerprint ON quorum_observations(fingerprint);

-- Create index on category for filtering
CREATE INDEX IF NOT EXISTS idx_quorum_observations_category ON quorum_observations(category);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_quorum_observations_status ON quorum_observations(status);

-- Create index on severity for filtering
CREATE INDEX IF NOT EXISTS idx_quorum_observations_severity ON quorum_observations(severity);

-- Create index on source_agent for filtering
CREATE INDEX IF NOT EXISTS idx_quorum_observations_source_agent ON quorum_observations(source_agent);

-- Create index on ref_id and ref_type for related lookups
CREATE INDEX IF NOT EXISTS idx_quorum_observations_ref ON quorum_observations(ref_id, ref_type) WHERE ref_id IS NOT NULL;

-- Create composite index for common queries
CREATE INDEX IF NOT EXISTS idx_quorum_observations_composite ON quorum_observations(status, category, created_at DESC);

-- Add unique constraint on fingerprint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_quorum_observations_fingerprint_unique ON quorum_observations(fingerprint);

-- Add thread_id and thread_title columns to quorum_events if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quorum_events'
    AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE quorum_events ADD COLUMN thread_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quorum_events'
    AND column_name = 'thread_title'
  ) THEN
    ALTER TABLE quorum_events ADD COLUMN thread_title TEXT;
  END IF;
END $$;

-- Create index on thread_id for faster thread lookups
CREATE INDEX IF NOT EXISTS idx_quorum_events_thread_id ON quorum_events(thread_id) WHERE thread_id IS NOT NULL;

-- Add comment on table
COMMENT ON TABLE quorum_observations IS 'Stores agent observations including critiques, risks, insights, and recommendations that are not actionable tasks';

-- Add comments on columns
COMMENT ON COLUMN quorum_observations.category IS 'Type of observation: critique, risk, insight, recommendation, issue, improvement, other';
COMMENT ON COLUMN quorum_observations.content IS 'The main content/text of the observation';
COMMENT ON COLUMN quorum_observations.source_agent IS 'Name of the agent that created this observation';
COMMENT ON COLUMN quorum_observations.severity IS 'Severity level: info, low, medium, high, critical';
COMMENT ON COLUMN quorum_observations.status IS 'Current status: open, acknowledged, addressed, dismissed';
COMMENT ON COLUMN quorum_observations.ref_id IS 'Optional reference to related entity (document, task, event, etc.)';
COMMENT ON COLUMN quorum_observations.ref_type IS 'Type of the referenced entity';
COMMENT ON COLUMN quorum_observations.fingerprint IS 'Hash for deduplication of identical observations';
