-- Admin AI management tables: AI config, API credentials, feature access, audit log.

-- Singleton row holding runtime AI grading parameters.
CREATE TABLE IF NOT EXISTS ai_config (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  model         VARCHAR NOT NULL DEFAULT 'gpt-4o-mini',
  temperature   NUMERIC(3, 2) NOT NULL DEFAULT 0.20,
  max_tokens    INTEGER,
  system_prompt TEXT NOT NULL DEFAULT '',
  updated_by    VARCHAR,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_config_singleton CHECK (id = 1)
);

-- Encrypted external API credentials, keyed by provider.
CREATE TABLE IF NOT EXISTS api_credential (
  provider      VARCHAR PRIMARY KEY,
  encrypted_key TEXT NOT NULL,
  key_hint      VARCHAR NOT NULL,
  updated_by    VARCHAR,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-teacher / per-course feature enablement for AI grading and plagiarism.
CREATE TABLE IF NOT EXISTS feature_access (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type VARCHAR NOT NULL CHECK (scope_type IN ('teacher', 'course')),
  scope_id   VARCHAR NOT NULL,
  feature    VARCHAR NOT NULL CHECK (feature IN ('ai_grading', 'plagiarism')),
  enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by VARCHAR,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_type, scope_id, feature)
);

-- System audit trail for admin actions and AI usage events.
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id VARCHAR,
  actor_name    VARCHAR,
  action        VARCHAR NOT NULL,
  entity_type   VARCHAR,
  entity_id     VARCHAR,
  details       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_feature_access_scope ON feature_access(scope_type, scope_id);

-- Seed the singleton config row.
INSERT INTO ai_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
