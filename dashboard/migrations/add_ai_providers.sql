-- Migration for standalone AI provider support
-- This adds tables for AI providers, agent model assignments, and sessions

-- Provider configurations (OAuth + API keys)
CREATE TABLE IF NOT EXISTS quorum_ai_providers (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('openai', 'anthropic', 'google', 'openrouter', 'custom')),
  name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  api_key_encrypted TEXT,
  oauth_token TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at TIMESTAMPTZ,
  base_url TEXT,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for providers
CREATE INDEX IF NOT EXISTS idx_quorum_ai_providers_type ON quorum_ai_providers(provider_type);
CREATE INDEX IF NOT EXISTS idx_quorum_ai_providers_enabled ON quorum_ai_providers(is_enabled);

-- Model assignments per agent
CREATE TABLE IF NOT EXISTS quorum_agent_models (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_name TEXT NOT NULL UNIQUE,
  primary_provider_id TEXT NOT NULL REFERENCES quorum_ai_providers(id) ON DELETE CASCADE,
  primary_model TEXT NOT NULL,
  fallback_provider_id TEXT REFERENCES quorum_ai_providers(id) ON DELETE SET NULL,
  fallback_model TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for agent models
CREATE INDEX IF NOT EXISTS idx_quorum_agent_models_agent ON quorum_agent_models(agent_name);
CREATE INDEX IF NOT EXISTS idx_quorum_agent_models_primary_provider ON quorum_agent_models(primary_provider_id);

-- Session storage for conversation context
CREATE TABLE IF NOT EXISTS quorum_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT UNIQUE NOT NULL,
  agent_name TEXT,
  messages JSONB DEFAULT '[]',
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_quorum_sessions_session_id ON quorum_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_quorum_sessions_agent ON quorum_sessions(agent_name);

-- Comments
COMMENT ON TABLE quorum_ai_providers IS 'Configured AI providers (OpenAI, Anthropic, Google, etc.)';
COMMENT ON TABLE quorum_agent_models IS 'Maps Quorum agents to their AI models (primary + fallback)';
COMMENT ON TABLE quorum_sessions IS 'Stores conversation history and context for AI sessions';

COMMENT ON COLUMN quorum_ai_providers.api_key_encrypted IS 'Encrypted API key for the provider';
COMMENT ON COLUMN quorum_ai_providers.oauth_token IS 'OAuth access token (if applicable)';
COMMENT ON COLUMN quorum_ai_providers.base_url IS 'Custom base URL for custom providers';
COMMENT ON COLUMN quorum_ai_providers.metadata IS 'Additional configuration including default model';

COMMENT ON COLUMN quorum_agent_models.primary_model IS 'Model ID to use for this agent';
COMMENT ON COLUMN quorum_agent_models.fallback_model IS 'Fallback model ID if primary fails';
