-- Local (Ollama) configuration singleton.
--
-- Deliberately NOT stored in `ai_config`. That row currently holds
-- 'gpt-4o-mini' and IS the frozen provenance record of the config-v1.4
-- validation run; the admin UI edits it directly. Overwriting it would destroy
-- the baseline the local arm is meant to be compared against.
--
-- `ai_config` stays provider-neutral (temperature / max_tokens / system_prompt,
-- all of which transfer 1:1 to Ollama); only local-specific knobs live here.
--
-- Precedence at read time is env > this row > code default — the inverse of
-- `ai_config`. The validation harness has to sweep models across runs and must
-- be able to do that without mutating shared admin state.

CREATE TABLE IF NOT EXISTS local_ai_config (
  id              INTEGER PRIMARY KEY DEFAULT 1,
  base_url        VARCHAR NOT NULL DEFAULT 'http://localhost:11434',
  chat_model      VARCHAR NOT NULL DEFAULT 'qwen2.5:14b-instruct-q4_K_M',
  embed_model     VARCHAR NOT NULL DEFAULT 'bge-m3',
  embed_dims      INTEGER NOT NULL DEFAULT 1024,
  num_ctx         INTEGER NOT NULL DEFAULT 8192,
  num_predict     INTEGER NOT NULL DEFAULT 1536,
  keep_alive      VARCHAR NOT NULL DEFAULT '30m',
  retrieval_top_k INTEGER NOT NULL DEFAULT 6,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT local_ai_config_singleton CHECK (id = 1)
);

INSERT INTO local_ai_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
