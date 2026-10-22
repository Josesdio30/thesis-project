-- Identity of a course-material document is its CONTENT, not the resource row
-- that happens to point at it.
--
-- 012 keyed rag_documents on (resource_id, checksum). Two LMS resources holding
-- byte-identical files therefore produced two documents, and an assignment
-- referencing both got every chunk twice: retrieval returned the same passage
-- under two labels, wasting half the context window and making one source look
-- like two independent corroborations. Observed on the agama validation
-- assignment, whose resources 13 and 14 share checksum a42cc1ff…
--
-- Keying on checksum alone also delivers the cross-assignment dedup 012 was
-- reaching for, and still detects an edited file (new content, new checksum).
-- resource_id stays as provenance for the first resource that introduced it.

DELETE FROM rag_documents a
      USING rag_documents b
      WHERE a.checksum = b.checksum
        AND a.ctid > b.ctid;

ALTER TABLE rag_documents DROP CONSTRAINT IF EXISTS rag_documents_resource_id_checksum_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_documents_checksum ON rag_documents(checksum);
