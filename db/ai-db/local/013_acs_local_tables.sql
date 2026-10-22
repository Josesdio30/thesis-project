-- Automated Grading tables for the local provider.
--
-- Mirrors acs_* so the frozen OpenAI results stay untouched and the two arms
-- can be compared row for row. The baseline tables are never ALTERed.
--
-- Two structural changes:
--   * corpus_id (rag_corpora) replaces vector_store_id (OpenAI)
--   * token usage records latency instead of cost, because cost is always zero
--     and latency is the metric that actually decides whether local grading is
--     usable in class

CREATE TABLE IF NOT EXISTS acs_local_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL UNIQUE,
  course_id VARCHAR NOT NULL,
  corpus_id UUID REFERENCES rag_corpora(id) ON DELETE SET NULL,
  rubric JSONB NOT NULL,
  created_by VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'setup',
  rerun_grading BOOLEAN NOT NULL DEFAULT FALSE,
  rerun_grading_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acs_local_grading_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  status VARCHAR NOT NULL DEFAULT 'pending',
  -- Counts answers that fell back to a null score because the model's JSON did
  -- not parse. The validation harness filters nulls out of its medians, so a
  -- half-failed run would otherwise report a BETTER-looking median over fewer
  -- samples. This column is what makes that failure visible.
  null_fallback_count INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acs_local_grading_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES acs_local_grading_jobs(id) ON DELETE SET NULL,
  assignment_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL,
  question_id VARCHAR NOT NULL,
  score NUMERIC(10, 2),
  max_score NUMERIC(10, 2) NOT NULL,
  qualitative_grade VARCHAR,
  feedback TEXT NOT NULL,
  citations JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence VARCHAR NOT NULL,
  rubric_alignment JSONB NOT NULL DEFAULT '{}'::jsonb,
  language_detected VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acs_local_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES acs_local_grading_jobs(id) ON DELETE SET NULL,
  assignment_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL,
  tokens_used INTEGER NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  -- Always 0 for the local provider; kept so the two arms share a shape.
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  -- Separated from latency_ms so a cold model load is never mistaken for slow
  -- inference. A non-zero value here invalidates the sample as steady-state.
  load_ms INTEGER NOT NULL DEFAULT 0,
  eval_tokens_per_sec NUMERIC(10, 2) NOT NULL DEFAULT 0,
  retrieval_ms INTEGER NOT NULL DEFAULT 0,
  model VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acs_local_assignments_assignment_id ON acs_local_assignments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_acs_local_grading_jobs_assignment_id ON acs_local_grading_jobs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_acs_local_grading_jobs_status ON acs_local_grading_jobs(status);
CREATE INDEX IF NOT EXISTS idx_acs_local_grading_results_job_id ON acs_local_grading_results(job_id);
CREATE INDEX IF NOT EXISTS idx_acs_local_grading_results_assignment_student
  ON acs_local_grading_results(assignment_id, student_id);
CREATE INDEX IF NOT EXISTS idx_acs_local_token_usage_job_id ON acs_local_token_usage(job_id);
