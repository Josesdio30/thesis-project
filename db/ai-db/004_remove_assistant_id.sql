-- Migration: Remove assistant_id from acs_assignments
-- Reason: Migrated from OpenAI Assistants API to Responses API.
-- Assistants are no longer created as persistent objects; the system prompt
-- and model config are now sent directly in each responses.create() call.
-- Only vector_store_id is needed to link course materials.

ALTER TABLE acs_assignments DROP COLUMN IF EXISTS assistant_id;
