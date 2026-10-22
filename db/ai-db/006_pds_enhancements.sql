-- Per-question chunk tracking: tag each chunk with the question it belongs to
-- so comparisons enforce Q1-of-A vs Q1-of-B (not cross-question mixing).
ALTER TABLE pds_chunks
  ADD COLUMN IF NOT EXISTS question_index INTEGER NOT NULL DEFAULT 0;

-- Scope metadata: record which question IDs were scanned in each detection run.
-- ['all'] means every essay question; otherwise an array of specific question ID strings.
ALTER TABLE pds_detections
  ADD COLUMN IF NOT EXISTS scanned_question_ids TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[];
