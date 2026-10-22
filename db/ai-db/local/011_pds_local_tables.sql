-- Plagiarism Detection tables for the local provider.
--
-- WHY MIRROR RATHER THAN REUSE: `cleanupPreviousDetectionData()` deletes
-- pds_chunks rows for the submissions about to be re-scanned, and
-- pds_embeddings cascades off pds_chunks. Running the local provider against
-- the same submission IDs would therefore ERASE the OpenAI baseline embeddings
-- that the published results (P=1.000 / R=0.722 / F1=0.839 over 315 pairs) were
-- computed from. Separate tables make that impossible.
--
-- Differences from 003_pds_tables.sql + 006_pds_enhancements.sql:
--   * VECTOR(1024) and model default 'bge-m3'
--   * question_index / scanned_question_ids inline instead of a later ALTER
--   * no ivfflat index (see the note at the bottom)

CREATE TABLE IF NOT EXISTS pds_local_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_submissions INTEGER NOT NULL DEFAULT 0,
  processed_submissions INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR NOT NULL,
  scanned_question_ids TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[]
);

CREATE TABLE IF NOT EXISTS pds_local_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id VARCHAR NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  question_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_local_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES pds_local_chunks(id) ON DELETE CASCADE,
  vector VECTOR(1024),
  model VARCHAR NOT NULL DEFAULT 'bge-m3',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_local_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_submission_id VARCHAR NOT NULL,
  target_submission_id VARCHAR NOT NULL,
  semantic_score NUMERIC(5, 4) NOT NULL,
  lexical_score NUMERIC(5, 4) NOT NULL,
  combined_score NUMERIC(5, 4) NOT NULL,
  risk_level VARCHAR NOT NULL,
  matched_chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  compared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_submission_id, target_submission_id)
);

CREATE TABLE IF NOT EXISTS pds_local_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES pds_local_comparisons(id) ON DELETE CASCADE,
  submission_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR,
  is_false_positive BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_notes TEXT,
  action_taken VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comparison_id, submission_id)
);

CREATE TABLE IF NOT EXISTS pds_local_teacher_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID NOT NULL REFERENCES pds_local_flags(id) ON DELETE CASCADE,
  teacher_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_local_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  entity_type VARCHAR NOT NULL,
  entity_id VARCHAR NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pds_local_chunks_submission ON pds_local_chunks(submission_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_chunks_question ON pds_local_chunks(question_index);
CREATE INDEX IF NOT EXISTS idx_pds_local_embeddings_chunk ON pds_local_embeddings(chunk_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_comparisons_source ON pds_local_comparisons(source_submission_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_comparisons_target ON pds_local_comparisons(target_submission_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_comparisons_risk ON pds_local_comparisons(risk_level);
CREATE INDEX IF NOT EXISTS idx_pds_local_flags_submission ON pds_local_flags(submission_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_flags_status ON pds_local_flags(status);
CREATE INDEX IF NOT EXISTS idx_pds_local_flags_reviewed ON pds_local_flags(reviewed);
CREATE INDEX IF NOT EXISTS idx_pds_local_audit_logs_user ON pds_local_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_audit_logs_entity ON pds_local_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_pds_local_audit_logs_created ON pds_local_audit_logs(created_at);

-- NO VECTOR INDEX HERE — ON PURPOSE.
--
-- 003_pds_tables.sql uses ivfflat with lists = 100, tuned for 100k+ rows. This
-- dataset holds a few hundred vectors per detection run, where ivfflat with the
-- default probes = 1 returns APPROXIMATE nearest neighbours: the same query can
-- return a different top-K on a different run. The published result claims
-- "Fidelity: PASS (exact)" for the reproduction of all 315 pairs, which an
-- approximate index makes impossible to honour.
--
-- A flat scan over this many rows costs milliseconds and is exactly
-- reproducible. Revisit only if a corpus ever grows past ~50k chunks, and then
-- use HNSW (see 012) rather than ivfflat.
