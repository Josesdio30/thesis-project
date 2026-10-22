-- Migration: Add resource_id to acs_uploaded_files for cross-assignment file deduplication.
-- Previously files were tracked per-assignment. Now they're tracked per LMS resource,
-- so the same course material uploaded once can be shared across multiple assignments.

ALTER TABLE acs_uploaded_files ADD COLUMN IF NOT EXISTS resource_id INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_acs_uploaded_files_resource_id
  ON acs_uploaded_files(resource_id) WHERE resource_id IS NOT NULL;
