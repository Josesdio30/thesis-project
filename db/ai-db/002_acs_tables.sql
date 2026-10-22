CREATE TABLE IF NOT EXISTS acs_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL UNIQUE,
  course_id VARCHAR NOT NULL,
  vector_store_id VARCHAR NOT NULL,
  rubric JSONB NOT NULL,
  created_by VARCHAR NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'setup',
  rerun_grading BOOLEAN NOT NULL DEFAULT FALSE,
  rerun_grading_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acs_uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL,
  resource_id INTEGER,
  file_id VARCHAR NOT NULL,
  filename VARCHAR NOT NULL,
  type_file VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, file_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_acs_uploaded_files_resource_id
  ON acs_uploaded_files(resource_id) WHERE resource_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS acs_grading_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL,
  total_students INTEGER NOT NULL DEFAULT 0,
  status VARCHAR NOT NULL DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS acs_grading_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES acs_grading_jobs(id) ON DELETE SET NULL,
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

CREATE TABLE IF NOT EXISTS acs_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES acs_grading_jobs(id) ON DELETE SET NULL,
  assignment_id VARCHAR NOT NULL,
  student_id VARCHAR NOT NULL,
  tokens_used INTEGER NOT NULL,
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acs_assignments_assignment_id
  ON acs_assignments(assignment_id);

CREATE INDEX IF NOT EXISTS idx_acs_uploaded_files_assignment_id
  ON acs_uploaded_files(assignment_id);

CREATE INDEX IF NOT EXISTS idx_acs_grading_jobs_assignment_id
  ON acs_grading_jobs(assignment_id);

CREATE INDEX IF NOT EXISTS idx_acs_grading_jobs_status
  ON acs_grading_jobs(status);

CREATE INDEX IF NOT EXISTS idx_acs_grading_results_job_id
  ON acs_grading_results(job_id);

CREATE INDEX IF NOT EXISTS idx_acs_grading_results_assignment_student
  ON acs_grading_results(assignment_id, student_id);

CREATE INDEX IF NOT EXISTS idx_acs_token_usage_job_id
  ON acs_token_usage(job_id);
