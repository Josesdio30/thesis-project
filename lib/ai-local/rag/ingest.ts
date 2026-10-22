/**
 * Builds the local RAG corpus for an assignment — the replacement for
 * uploading files to OpenAI and creating a Vector Store.
 *
 * The returned shape matches the OpenAI branch exactly so the route's response
 * contract, and therefore AutoGradingModal, does not change.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chunkText } from '@/lib/plagiarism/text-processor';
import { getAiProvider, type EmbeddingProvider } from '@/lib/ai';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { refreshLocalAiConfig } from '@/lib/ai-local/config-repo';
import { sha256 } from '@/lib/ai-local/rag/checksum';
import { parseDocument, type ParsedDocument } from '@/lib/ai-local/rag/parsers';
import {
  countDocumentChunks,
  deleteDocumentChunks,
  findDocumentByChecksum,
  getCorpusByAssignment,
  insertChunksWithEmbeddings,
  insertDocument,
  linkCorpusDocument,
  replaceCorpus,
  unlinkCorpusDocuments,
  type RagChunkInsert,
} from '@/lib/ai-local/rag/repo';

/**
 * Smaller than the 900/150 the plagiarism pipeline uses. Retrieval wants
 * precision, and 6 x 350 tokens sits comfortably inside num_ctx 8192 alongside
 * the system prompt, rubric, answer and output budget.
 */
const RAG_TARGET_TOKENS = 350;
const RAG_OVERLAP_TOKENS = 70;

/**
 * `chunkText` short-circuits text below targetTokens/2 into a single chunk,
 * which is correct but can yield a one-line slide that still wins top-K on a
 * short query. Such chunks carry no usable context.
 */
const MIN_CHUNK_CHARS = 80;

export interface IngestResource {
  id: number;
  file_url: string;
  file_name: string;
}

export interface CorpusResult {
  corpus_id: string;
  files_reused: number;
  files_uploaded: number;
  files_indexed: number;
  files_failed: number;
  warning?: string;
}

export interface CreateLocalCorpusInput {
  assignmentId: string;
  courseId: string;
  createdBy: string;
  resources: IngestResource[];
}

/** The file itself is the problem (unsupported type, unparseable, no usable
 *  text) — as opposed to an infrastructure failure such as Ollama being down.
 *  The distinction lets a route answer 400 rather than 500. */
export class UnprocessableFileError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'UnprocessableFileError';
  }
}

export class CorpusNotConfiguredError extends Error {
  constructor(readonly assignmentId: string) {
    super(`assignment ${assignmentId} has no local RAG corpus`);
    this.name = 'CorpusNotConfiguredError';
  }
}

export interface IngestFileInput {
  corpusId: string;
  resourceId: number | null;
  fileName: string;
  buffer: Buffer;
}

export interface IngestFileResult {
  document_id: string;
  /** The stored name for a reused document, which may differ from the upload. */
  file_name: string;
  reused: boolean;
  low_text: boolean;
}

interface IngestContext {
  embedDims: number;
  embeddings: EmbeddingProvider;
}

const resolveIngestContext = (): IngestContext => ({
  embedDims: resolveLocalAiConfig().embedDims,
  embeddings: getAiProvider('local').embeddings,
});

/**
 * Parses, chunks, embeds and links one file into an existing corpus. This is
 * the single code path for both the full corpus build and a one-off upload, so
 * the two cannot drift in chunking or caching rules. Throws on failure.
 */
export async function ingestFileIntoCorpus(
  file: IngestFileInput,
  context: IngestContext = resolveIngestContext()
): Promise<IngestFileResult> {
  const checksum = sha256(file.buffer);

  // Unchanged content that still has chunks needs no work at all.
  const cached = await findDocumentByChecksum(checksum);
  if (cached && (await countDocumentChunks(cached.id)) > 0) {
    await linkCorpusDocument(file.corpusId, cached.id);
    return { document_id: cached.id, file_name: cached.file_name, reused: true, low_text: cached.low_text };
  }

  let parsed: ParsedDocument;
  try {
    parsed = await parseDocument(file.fileName, file.buffer);
  } catch (error) {
    throw new UnprocessableFileError('could not parse file', { cause: error });
  }
  if (parsed.sections.length === 0) {
    throw new UnprocessableFileError('no extractable text');
  }

  const document = await insertDocument({
    resource_id: file.resourceId,
    file_name: file.fileName,
    checksum,
    low_text: parsed.lowText,
    char_count: parsed.charCount,
  });
  // A checksum collision cannot happen, but a partially ingested document
  // from a crashed run can. Start clean.
  await deleteDocumentChunks(document.id);

  // Chunk per section: normalizeText flattens whitespace, so concatenating
  // sections first would destroy the page and slide boundaries that make
  // citations checkable.
  const chunks: RagChunkInsert[] = [];
  let chunkIndex = 0;
  for (const section of parsed.sections) {
    for (const piece of chunkText(section.text, RAG_TARGET_TOKENS, RAG_OVERLAP_TOKENS)) {
      if (piece.content.trim().length < MIN_CHUNK_CHARS) continue;
      chunks.push({
        document_id: document.id,
        content: piece.content,
        chunk_index: chunkIndex++,
        locator: section.locator,
        token_count: piece.token_count,
      });
    }
  }

  if (chunks.length === 0) {
    throw new UnprocessableFileError('no chunks above the minimum length');
  }

  const embedded = await context.embeddings.embed(chunks.map(c => c.content));
  if (embedded.dims !== context.embedDims) {
    throw new Error(`embedding width ${embedded.dims} does not match the configured ${context.embedDims}`);
  }

  await insertChunksWithEmbeddings(chunks, embedded.vectors, embedded.model);
  await linkCorpusDocument(file.corpusId, document.id);
  return { document_id: document.id, file_name: file.fileName, reused: false, low_text: parsed.lowText };
}

/**
 * Adds one file to an assignment's existing corpus without rebuilding it — the
 * local counterpart of attaching a file to an OpenAI Vector Store.
 */
export async function addFileToAssignmentCorpus(input: {
  assignmentId: string;
  fileName: string;
  buffer: Buffer;
  resourceId?: number | null;
}): Promise<{ document_id: string; file_name: string; reused: boolean }> {
  // ingestFileIntoCorpus resolves its context in a default parameter, which
  // runs before its body, so the cache has to be warm by now.
  await refreshLocalAiConfig();
  const corpus = await getCorpusByAssignment(input.assignmentId);
  if (!corpus) {
    throw new CorpusNotConfiguredError(input.assignmentId);
  }

  const result = await ingestFileIntoCorpus({
    corpusId: corpus.id,
    resourceId: input.resourceId ?? null,
    fileName: input.fileName,
    buffer: input.buffer,
  });
  return { document_id: result.document_id, file_name: result.file_name, reused: result.reused };
}

export async function createLocalCorpus(input: CreateLocalCorpusInput): Promise<CorpusResult> {
  await refreshLocalAiConfig();
  const config = resolveLocalAiConfig();
  const context: IngestContext = { embedDims: config.embedDims, embeddings: getAiProvider('local').embeddings };

  const corpus = await replaceCorpus({
    assignment_id: input.assignmentId,
    course_id: input.courseId,
    embed_model: config.embedModel,
    embed_dims: config.embedDims,
    created_by: input.createdBy,
  });

  // The corpus is rebuilt from scratch; documents survive as a parse cache.
  await unlinkCorpusDocuments(corpus.id);

  let filesReused = 0;
  let filesIndexed = 0;
  let filesFailed = 0;
  const lowTextFiles: string[] = [];

  for (const resource of input.resources) {
    try {
      const localPath = path.join(process.cwd(), 'public', resource.file_url);
      if (!existsSync(localPath)) {
        throw new Error('file not found on disk');
      }

      const result = await ingestFileIntoCorpus(
        { corpusId: corpus.id, resourceId: resource.id, fileName: resource.file_name, buffer: readFileSync(localPath) },
        context
      );
      if (result.low_text) lowTextFiles.push(result.file_name);
      if (result.reused) filesReused++;
      filesIndexed++;
    } catch (error) {
      // Logged in full for the operator; the response only reports counts, so
      // internal error text never reaches the teacher-facing warning.
      console.error(`[RAG] failed to ingest resource ${resource.id} (${resource.file_name}):`, error);
      filesFailed++;
    }
  }

  const warnings: string[] = [];
  if (filesFailed > 0) {
    warnings.push(`${filesFailed} file(s) failed to index and will not be used during grading.`);
  }
  if (lowTextFiles.length > 0) {
    // No OCR by design — say so rather than indexing an effectively empty file.
    warnings.push(
      `${lowTextFiles.length} file(s) yielded very little text (likely scanned images): ${lowTextFiles.join(', ')}.`
    );
  }

  return {
    corpus_id: corpus.id,
    files_reused: filesReused,
    files_uploaded: filesIndexed - filesReused,
    files_indexed: filesIndexed,
    files_failed: filesFailed,
    ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
  };
}
