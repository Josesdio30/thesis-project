/**
 * Data access for the local RAG corpus (`rag_*` tables).
 *
 * Kept separate from `lib/db2/pds-repo.ts` because these tables have no
 * baseline counterpart — the corpus replaces the OpenAI Vector Store, which was
 * never a table at all.
 */
import { queryAux } from '@/lib/aux-db';

export interface RagCorpusRow {
  id: string;
  assignment_id: string;
  course_id: string;
  embed_model: string;
  embed_dims: number;
}

export interface RagDocumentRow {
  id: string;
  resource_id: number | null;
  file_name: string;
  checksum: string;
  low_text: boolean;
  char_count: number;
}

export interface RagChunkInsert {
  document_id: string;
  content: string;
  chunk_index: number;
  locator: string;
  token_count: number;
}

export interface RetrievedChunkRow {
  chunk_id: string;
  content: string;
  locator: string;
  file_name: string;
  similarity: number;
}

/** Replaces the assignment's corpus. Chunks and embeddings cascade away;
 *  `rag_documents` deliberately survive as a parse cache. */
export async function replaceCorpus(input: {
  assignment_id: string;
  course_id: string;
  embed_model: string;
  embed_dims: number;
  created_by: string;
}): Promise<RagCorpusRow> {
  const rows = await queryAux<RagCorpusRow>(
    `
      INSERT INTO rag_corpora (assignment_id, course_id, embed_model, embed_dims, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (assignment_id)
      DO UPDATE SET
        course_id = EXCLUDED.course_id,
        embed_model = EXCLUDED.embed_model,
        embed_dims = EXCLUDED.embed_dims,
        created_by = EXCLUDED.created_by,
        created_at = NOW()
      RETURNING id, assignment_id, course_id, embed_model, embed_dims
    `,
    [input.assignment_id, input.course_id, input.embed_model, input.embed_dims, input.created_by]
  );
  return rows[0];
}

export async function unlinkCorpusDocuments(corpusId: string): Promise<void> {
  await queryAux(`DELETE FROM rag_corpus_documents WHERE corpus_id = $1`, [corpusId]);
}

export async function linkCorpusDocument(corpusId: string, documentId: string): Promise<void> {
  await queryAux(
    `INSERT INTO rag_corpus_documents (corpus_id, document_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [corpusId, documentId]
  );
}

/**
 * A document is identified by its CONTENT alone. The same checksum means the
 * file has not changed and its chunks and embeddings can be reused, whichever
 * resource row points at it; a different checksum means it was edited and must
 * be re-parsed. OpenAI cannot make the second distinction, which is the entire
 * reason the reindex-grounding workaround exists.
 *
 * Keying on the resource as well was wrong: two LMS resources holding the same
 * file produced two documents, and an assignment referencing both got every
 * chunk twice.
 */
export async function findDocumentByChecksum(checksum: string): Promise<RagDocumentRow | null> {
  const rows = await queryAux<RagDocumentRow>(
    `SELECT id, resource_id, file_name, checksum, low_text, char_count
     FROM rag_documents WHERE checksum = $1`,
    [checksum]
  );
  return rows[0] ?? null;
}

export async function insertDocument(input: {
  resource_id: number | null;
  file_name: string;
  checksum: string;
  low_text: boolean;
  char_count: number;
}): Promise<RagDocumentRow> {
  const rows = await queryAux<RagDocumentRow>(
    `
      INSERT INTO rag_documents (resource_id, file_name, checksum, low_text, char_count)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (checksum) DO UPDATE SET file_name = EXCLUDED.file_name
      RETURNING id, resource_id, file_name, checksum, low_text, char_count
    `,
    [input.resource_id, input.file_name, input.checksum, input.low_text, input.char_count]
  );
  return rows[0];
}

export async function deleteDocumentChunks(documentId: string): Promise<void> {
  await queryAux(`DELETE FROM rag_chunks WHERE document_id = $1`, [documentId]);
}

export async function countDocumentChunks(documentId: string): Promise<number> {
  const rows = await queryAux<{ n: string }>(
    `SELECT count(*)::text AS n FROM rag_chunks WHERE document_id = $1`,
    [documentId]
  );
  return Number(rows[0].n);
}

/**
 * Inserts chunks and their vectors together. Ids come back in insertion order
 * via a single multi-row INSERT, so vectors are matched positionally rather
 * than by searching for a matching chunk_index.
 */
export async function insertChunksWithEmbeddings(
  chunks: RagChunkInsert[],
  vectors: number[][],
  model: string
): Promise<number> {
  if (chunks.length === 0) return 0;
  if (chunks.length !== vectors.length) {
    throw new Error(`insertChunksWithEmbeddings: ${chunks.length} chunks vs ${vectors.length} vectors`);
  }

  const chunkValues: string[] = [];
  const chunkParams: unknown[] = [];
  chunks.forEach((chunk, i) => {
    const base = i * 5;
    chunkValues.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    chunkParams.push(chunk.document_id, chunk.content, chunk.chunk_index, chunk.locator, chunk.token_count);
  });

  const inserted = await queryAux<{ id: string }>(
    `INSERT INTO rag_chunks (document_id, content, chunk_index, locator, token_count)
     VALUES ${chunkValues.join(', ')} RETURNING id`,
    chunkParams
  );

  const embedValues: string[] = [];
  const embedParams: unknown[] = [];
  inserted.forEach((row, i) => {
    const base = i * 3;
    embedValues.push(`($${base + 1}, $${base + 2}::vector, $${base + 3})`);
    embedParams.push(row.id, `[${vectors[i].join(',')}]`, model);
  });

  await queryAux(
    `INSERT INTO rag_embeddings (chunk_id, vector, model) VALUES ${embedValues.join(', ')}`,
    embedParams
  );

  return inserted.length;
}

export async function getCorpusByAssignment(assignmentId: string): Promise<RagCorpusRow | null> {
  const rows = await queryAux<RagCorpusRow>(
    `SELECT id, assignment_id, course_id, embed_model, embed_dims
     FROM rag_corpora WHERE assignment_id = $1`,
    [assignmentId]
  );
  return rows[0] ?? null;
}

/** Nearest-neighbour search scoped to one corpus. */
export async function searchCorpus(
  corpusId: string,
  queryVector: number[],
  topK: number
): Promise<RetrievedChunkRow[]> {
  return queryAux<RetrievedChunkRow>(
    `
      SELECT c.id AS chunk_id,
             c.content,
             c.locator,
             d.file_name,
             1 - (e.vector <=> $2::vector) AS similarity
      FROM rag_corpus_documents cd
      JOIN rag_documents d ON d.id = cd.document_id
      JOIN rag_chunks c ON c.document_id = d.id
      JOIN rag_embeddings e ON e.chunk_id = c.id
      WHERE cd.corpus_id = $1
      ORDER BY e.vector <=> $2::vector ASC
      LIMIT $3
    `,
    [corpusId, `[${queryVector.join(',')}]`, topK]
  );
}
