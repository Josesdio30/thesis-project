CREATE TABLE IF NOT EXISTS pds_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_submissions INTEGER NOT NULL DEFAULT 0,
  processed_submissions INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS pds_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id VARCHAR NOT NULL,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  start_char INTEGER NOT NULL,
  end_char INTEGER NOT NULL,
  token_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES pds_chunks(id) ON DELETE CASCADE,
  vector VECTOR(384),
  model VARCHAR NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_comparisons (
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

CREATE TABLE IF NOT EXISTS pds_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comparison_id UUID NOT NULL REFERENCES pds_comparisons(id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS pds_teacher_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID NOT NULL REFERENCES pds_flags(id) ON DELETE CASCADE,
  teacher_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pds_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  entity_type VARCHAR NOT NULL,
  entity_id VARCHAR NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pds_chunks_submission
  ON pds_chunks(submission_id);

CREATE INDEX IF NOT EXISTS idx_pds_embeddings_chunk
  ON pds_embeddings(chunk_id);

CREATE INDEX IF NOT EXISTS idx_pds_comparisons_source
  ON pds_comparisons(source_submission_id);

CREATE INDEX IF NOT EXISTS idx_pds_comparisons_target
  ON pds_comparisons(target_submission_id);

CREATE INDEX IF NOT EXISTS idx_pds_comparisons_risk
  ON pds_comparisons(risk_level);

CREATE INDEX IF NOT EXISTS idx_pds_flags_submission
  ON pds_flags(submission_id);

CREATE INDEX IF NOT EXISTS idx_pds_flags_status
  ON pds_flags(status);

CREATE INDEX IF NOT EXISTS idx_pds_flags_reviewed
  ON pds_flags(reviewed);

CREATE INDEX IF NOT EXISTS idx_pds_audit_logs_user
  ON pds_audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_pds_audit_logs_entity
  ON pds_audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_pds_audit_logs_created
  ON pds_audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_pds_embeddings_vector
  ON pds_embeddings
  USING ivfflat (vector vector_cosine_ops) WITH (lists = 100);
