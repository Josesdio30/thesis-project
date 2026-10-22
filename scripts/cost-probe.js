/**
 * OpenAI cost probe — measures real token usage for:
 *   1) Automated Grading (Responses API, replicates lib/grading-service.ts)
 *   2) Plagiarism embeddings (text-embedding-3-small, replicates lib/plagiarism/embeddings.ts)
 *
 * Writes results to scripts/cost-probe-results.json
 *
 * NOTE: Grading probe runs WITHOUT the file_search tool (no vector store created),
 * so input_tokens here represent the *base* cost. Production grading calls inject
 * retrieved chunks as additional input tokens; see report for the caveat.
 */

const fs = require('fs');
const path = require('path');
require('./lib/load-env.cjs').loadProjectEnv();

const OpenAI = require('openai');

const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, '..', 'prompts', 'grading-system-prompt.txt'),
  'utf-8'
);

const GRADING_MODEL = 'gpt-4o-mini';
const EMBEDDING_MODEL = 'text-embedding-3-small';

// Three representative student answers (short / medium / long)
const SHORT_ANSWER = `A database is a structured collection of data. Tables store rows. SQL is used to query them.`;

const MEDIUM_ANSWER = `Database normalization is the process of organizing data to reduce redundancy and improve data integrity. The first normal form (1NF) requires that each column hold atomic values and each row be unique. The second normal form (2NF) builds on 1NF by removing partial dependencies — every non-key attribute must depend on the entire primary key. The third normal form (3NF) removes transitive dependencies, ensuring non-key attributes depend only on the primary key. Higher normal forms like BCNF address edge cases. In practice, designers often denormalize selectively for read performance, accepting some redundancy in exchange for fewer joins. The right level of normalization depends on the workload: OLTP systems benefit from higher normal forms, while analytical workloads often use star or snowflake schemas with intentional denormalization.`;

const LONG_ANSWER = MEDIUM_ANSWER + ' ' + MEDIUM_ANSWER + ' Additionally, indexing strategy is critical: B-tree indexes accelerate equality and range queries, hash indexes excel at equality lookups, GIN/GiST indexes serve full-text and geometric data. Query planners use statistics to choose join algorithms — nested loop for small inner sides, hash join for equi-joins on large unsorted data, merge join when both inputs are sorted. Transaction isolation levels trade consistency for concurrency: READ COMMITTED prevents dirty reads, REPEATABLE READ prevents non-repeatable reads, SERIALIZABLE prevents phantoms via predicate locking or SSI. MVCC implementations like PostgreSQL keep multiple row versions to allow readers and writers to proceed without blocking each other, at the cost of vacuum overhead.';

const RUBRIC = {
  questionId: 'q1',
  max_score: 100,
  criteria: [
    { name: 'Accuracy', weight: 40, description: 'Does the answer correctly describe normalization concepts and examples?' },
    { name: 'Completeness', weight: 30, description: 'Does the answer cover 1NF, 2NF, 3NF, and practical tradeoffs?' },
    { name: 'Clarity', weight: 20, description: 'Is the explanation well-structured and easy to follow?' },
    { name: 'Critical Thinking', weight: 10, description: 'Does the answer show understanding of when to apply each form?' },
  ],
};

async function probeGrading(openai, label, studentAnswer) {
  const messagePayload = {
    question_id: 'q1',
    student_answer: studentAnswer,
    rubric: RUBRIC,
    output_format: 'json',
  };

  const t0 = Date.now();
  const response = await openai.responses.create({
    model: GRADING_MODEL,
    instructions: SYSTEM_PROMPT,
    input: JSON.stringify(messagePayload),
    temperature: 0.2,
    store: false,
    text: { format: { type: 'json_object' } },
  });
  const latency_ms = Date.now() - t0;

  const usage = response.usage || {};
  return {
    label,
    studentAnswerChars: studentAnswer.length,
    studentAnswerWords: studentAnswer.split(/\s+/).length,
    model: GRADING_MODEL,
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    total_tokens: usage.total_tokens ?? null,
    latency_ms,
    status: response.status,
  };
}

function makeChunk(seed, approxTokens = 250) {
  // ~4 chars/token. Build a realistic-ish chunk.
  const base = `This is chunk number ${seed} discussing topic ${seed}. ` +
    'It contains representative academic prose about database systems, normalization, ' +
    'indexing strategies, and transaction management. The text aims to approximate ' +
    'the length and vocabulary of a student essay submission paragraph. ';
  const target = approxTokens * 4;
  let out = '';
  while (out.length < target) out += base;
  return out.slice(0, target);
}

async function probeEmbeddings(openai, label, batchSize, approxTokensPerChunk = 250) {
  const inputs = Array.from({ length: batchSize }, (_, i) => makeChunk(i, approxTokensPerChunk));
  const t0 = Date.now();
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
    encoding_format: 'float',
    dimensions: 384,
  });
  const latency_ms = Date.now() - t0;

  return {
    label,
    batchSize,
    approxTokensPerChunk,
    model: EMBEDDING_MODEL,
    total_tokens: response.usage.total_tokens,
    tokens_per_chunk_avg: response.usage.total_tokens / batchSize,
    latency_ms,
    dimensions: response.data[0].embedding.length,
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY');
    process.exit(1);
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const results = { grading: [], embeddings: [], timestamp: new Date().toISOString() };

  console.log('--- Grading probes (gpt-4o-mini, NO file_search) ---');
  results.grading.push(await probeGrading(openai, 'short', SHORT_ANSWER));
  console.log('  short:', results.grading[results.grading.length - 1]);
  results.grading.push(await probeGrading(openai, 'medium', MEDIUM_ANSWER));
  console.log('  medium:', results.grading[results.grading.length - 1]);
  results.grading.push(await probeGrading(openai, 'long', LONG_ANSWER));
  console.log('  long:', results.grading[results.grading.length - 1]);

  console.log('--- Embedding probes (text-embedding-3-small, 384 dims) ---');
  for (const batch of [5, 20, 50]) {
    const r = await probeEmbeddings(openai, `batch_${batch}`, batch);
    results.embeddings.push(r);
    console.log(`  ${r.label}:`, r);
  }

  const outPath = path.join(__dirname, 'cost-probe-results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to ${outPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
