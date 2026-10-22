-- Local RAG corpus: the replacement for the OpenAI Vector Store + `file_search`.
--
-- One `rag_corpora` row per assignment stands in for one vector store id.
-- Documents are keyed by (resource_id, checksum) rather than assignment, which
-- carries forward the cross-assignment dedup idea from 005_add_resource_id.sql
-- AND fixes a real limitation of the OpenAI path: OpenAI cannot tell that a
-- re-uploaded file has changed, which is the entire reason the
-- reindex-grounding workaround script exists. A content checksum detects an
-- edited file automatically, so that workaround becomes unnecessary.

CREATE TABLE IF NOT EXISTS rag_corpora (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id VARCHAR NOT NULL UNIQUE,
  course_id VARCHAR NOT NULL,
  embed_model VARCHAR NOT NULL,
  embed_dims INTEGER NOT NULL,
  created_by VARCHAR NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id INTEGER,
  file_name VARCHAR NOT NULL,
  -- SHA-256 of the file bytes. Same resource + same checksum = already parsed,
  -- so re-indexing is a no-op; a changed checksum forces a re-parse.
  checksum VARCHAR NOT NULL,
  -- Set when the parser extracted suspiciously little text (scanned PDF, image
  -- slides). Surfaced through the existing `warning` field the UI renders.
  low_text BOOLEAN NOT NULL DEFAULT FALSE,
  char_count INTEGER NOT NULL DEFAULT 0,
  parsed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource_id, checksum)
);

CREATE TABLE IF NOT EXISTS rag_corpus_documents (
  corpus_id UUID NOT NULL REFERENCES rag_corpora(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  PRIMARY KEY (corpus_id, document_id)
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  -- Human-readable position inside the source, e.g. 'p. 12' / 'slide 4'.
  -- This is what makes a citation checkable against the real document.
  locator VARCHAR NOT NULL DEFAULT '',
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS rag_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL UNIQUE REFERENCES rag_chunks(id) ON DELETE CASCADE,
  vector VECTOR(1024),
  model VARCHAR NOT NULL DEFAULT 'bge-m3',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_rag_corpus_documents_document ON rag_corpus_documents(document_id);

-- HNSW here, unlike the PDS tables. Two reasons it is the right call for
-- retrieval but not for pair scoring:
--   1. HNSW needs no training data and does not degrade on small N the way
--      ivfflat with lists = 100 does.
--   2. Retrieval recall is not reproducibility-critical — grading grounding
--      only needs good passages, not a bit-exact top-K.
-- Requires pgvector >= 0.5.0. If the server is older, drop this index; a flat
-- scan is fine at this scale. Do NOT substitute ivfflat.
CREATE INDEX IF NOT EXISTS idx_rag_embeddings_vector
  ON rag_embeddings
  USING hnsw (vector vector_cosine_ops) WITH (m = 16, ef_construction = 64);
