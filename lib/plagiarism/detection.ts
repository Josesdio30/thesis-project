
import { queryLMS } from '@/lib/lms-db';
import { chunkText } from '@/lib/plagiarism/text-processor';
import { generateEmbeddingsBatch } from '@/lib/plagiarism/embeddings';
import {
  cleanupPreviousDetectionData,
  createDetection,
  insertAuditLog,
  insertChunksReturningIds,
  insertComparisons,
  insertEmbeddings,
  insertFlags,
  updateDetection,
  findSimilarChunksLateral,
  pdsTables,
  SimilarChunkMatch
} from '@/lib/db2/pds-repo';
import { resolveProviderName } from '@/lib/ai';
import {
  calculateCombinedScore,
  calculateRiskLevel,
  SIMILARITY_THRESHOLDS,
  BM25Stats,
  calculateBM25CorpusStats,
  calculateBM25Similarity,
  calculateDistributionStats,
  calculateZScore,
  zScoreToNormalizedScore,
} from '@/lib/plagiarism/similarity';

// Minimum pair count to enable z-score (relative) scoring.
// Below this, we fall back to the fixed weighted formula.
// ~15 pairs corresponds to 6 submissions.
const MIN_PAIRS_FOR_ZSCORE = 15;

// Minimum cosine similarity to show a chunk pair in the evidence panel.
// This is a DISPLAY threshold — it does NOT affect scoring.
const EVIDENCE_DISPLAY_THRESHOLD = 0.5;

interface ChunkData {
  id?: string;
  content: string;
  chunk_index: number;
  question_index: number;
  start_char: number;
  end_char: number;
  token_count: number;
  embedding?: number[];
}

interface SubmissionData {
  submission_id: string;
  student_id: string;
  content: string;
  chunks?: ChunkData[];
  answerTexts?: Map<number, string>;  // question_index → raw answer text for per-Q Jaccard
}

interface ProcessingSubmission extends SubmissionData {
  answers: AnswerItem[];
}

interface AnswerItem {
  question_id: string;
  text: string;
}

interface QuestionAnswerRow {
  submission_id: string;
  student_id: string;
  question_id: string;
  answer_text: string;
}

interface PerQuestionScore {
  question_index: number;
  semantic_score: number;
  lexical_score: number;
  combined_score: number;
}

interface PairScoreResult {
  combinedScore: number;
  semanticScore: number;
  lexicalScore: number;
  perQuestionScores: PerQuestionScore[];
  matchedChunksData: any[];
}

interface PerQuestionRawScore {
  question_index: number;
  semantic_score: number;
  lexical_score: number;
}

interface PairRawResult {
  perQuestionRaw: PerQuestionRawScore[];
  matchedChunksData: any[];
}

interface QuestionDistribution {
  semanticMean: number;
  semanticStd: number;
  lexicalMean: number;
  lexicalStd: number;
}

/**
 * Creates a detection record and returns the ID immediately.
 */
export async function initDetection(
  assignmentId: string,
  userId: string,
  questionIds: string[] = []
) {
  const scanned_question_ids = questionIds.length === 0 ? ['all'] : questionIds;
  const detectionData = await createDetection(
    {
      assignment_id: assignmentId,
      status: 'processing',
      created_by: userId,
      scanned_question_ids,
    },
    pdsTables(resolveProviderName())
  );

  return detectionData.id;
}

/**
 * Runs the full plagiarism detection pipeline.
 *
 * Scoring design:
 * - Each question is scored INDEPENDENTLY: semantic (cosine) + lexical (Jaccard)
 *   are computed per-question, then combined per-question.
 * - The overall score = average of per-question combined scores.
 * - The semantic score uses RAW cosine similarity — no hard threshold gate.
 *   A separate (lower) display threshold controls which chunks appear in evidence.
 * - This means even moderate similarity (e.g. 0.65 cosine) contributes to the
 *   score instead of being silently zeroed out.
 */
export async function processDetection(
  detectionId: string,
  assignmentId: string,
  userId: string,
  questionIds: string[] = []
) {
  // Resolved once, outside the try, so the failure path in catch writes to the
  // same tables the run was using.
  const providerName = resolveProviderName();
  const tables = pdsTables(providerName);

  try {
    const numericAssignmentId = parseInt(assignmentId, 10);
    if (isNaN(numericAssignmentId)) throw new Error('Invalid Assignment ID format');

    const params: unknown[] = [numericAssignmentId];
    let questionFilter = '';
    if (questionIds.length > 0) {
      const numericIds = questionIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
      if (numericIds.length > 0) {
        params.push(numericIds);
        questionFilter = `AND q.id = ANY($${params.length}::int[])`;
      }
    }

    const sql = `
      SELECT
        s.id::text        AS submission_id,
        s.student_id::text AS student_id,
        q.id::text        AS question_id,
        a.answer_text
      FROM assignment_submissions s
      JOIN assignment_answers   a ON s.id = a.submission_id
      JOIN assignment_questions q ON a.question_id = q.id
      JOIN enumeration          e ON q.question_type_id = e.id
      WHERE s.assignment_id = $1
        AND a.answer_text IS NOT NULL
        AND a.answer_text <> ''
        AND UPPER(e.name) IN ('ESSAY', 'FILE_UPLOAD')
        ${questionFilter}
      ORDER BY s.id, q.order_number
    `;

    const rows = await queryLMS<QuestionAnswerRow>(sql, params);

    // Stable question_id → question_index mapping
    const questionOrderMap = new Map<string, number>();
    for (const row of rows) {
      if (!questionOrderMap.has(row.question_id)) {
        questionOrderMap.set(row.question_id, questionOrderMap.size);
      }
    }

    // Group rows by submission_id
    const submissionMap = new Map<
      string,
      { student_id: string; answers: AnswerItem[] }
    >();

    for (const row of rows) {
      if (!submissionMap.has(row.submission_id)) {
        submissionMap.set(row.submission_id, { student_id: row.student_id, answers: [] });
      }
      submissionMap.get(row.submission_id)!.answers.push({
        question_id: row.question_id,
        text: row.answer_text,
      });
    }

    const submissions: ProcessingSubmission[] = [];
    for (const [submissionId, sub] of submissionMap) {
      const fullContent = sub.answers.map(a => a.text).join('\n\n');
      if (fullContent.length > 50) {
        submissions.push({
          submission_id: submissionId,
          student_id: sub.student_id,
          content: fullContent,
          chunks: [],
          answers: sub.answers,
        });
      }
    }

    await updateDetection(detectionId, { total_submissions: submissions.length }, tables);
    console.log(`[PDS] Processing ${submissions.length} submissions for assignment ${assignmentId}`);

    const submissionIds = submissions.map(s => s.submission_id);
    await cleanupPreviousDetectionData(submissionIds, tables);

    // Process each submission: chunk per-question, embed, store
    const processedSubmissions: SubmissionData[] = [];
    let processedCount = 0;
    let embeddingModelUsed: string | null = null;
    let embeddingDimsUsed: number | null = null;

    for (const sub of submissions) {
      const questionAnswers = sub.answers;
      if (questionAnswers.length === 0) continue;

      const chunksForDb: {
        submission_id: string;
        content: string;
        chunk_index: number;
        question_index: number;
        start_char: number;
        end_char: number;
        token_count: number;
      }[] = [];
      const allChunkTexts: string[] = [];
      let globalChunkIndex = 0;

      // Build per-question answer text map for Jaccard scoring
      const answerTextsMap = new Map<number, string>();

      for (const answer of questionAnswers) {
        const qIdx = questionOrderMap.get(answer.question_id) ?? 0;
        answerTextsMap.set(qIdx, answer.text);

        const questionChunks = chunkText(answer.text);
        for (const c of questionChunks) {
          chunksForDb.push({
            submission_id: sub.submission_id,
            content: c.content,
            chunk_index: globalChunkIndex,
            question_index: qIdx,
            start_char: c.start_char,
            end_char: c.end_char,
            token_count: c.token_count,
          });
          allChunkTexts.push(c.content);
          globalChunkIndex++;
        }
      }

      if (chunksForDb.length === 0) continue;

      const insertedChunks = await insertChunksReturningIds(chunksForDb, tables);
      const chunksWithIds = chunksForDb.map(c => {
        const dbChunk = insertedChunks.find(ic => ic.chunk_index === c.chunk_index);
        if (!dbChunk?.id) {
          throw new Error(`Failed to map chunk index ${c.chunk_index} to a DB row`);
        }
        return { ...c, id: dbChunk.id };
      });

      const { vectors, model: embeddingModel, dims } = await generateEmbeddingsBatch(allChunkTexts);
      embeddingModelUsed = embeddingModel;
      embeddingDimsUsed = dims;

      await insertEmbeddings(
        chunksWithIds.map((c, idx) => ({
          chunk_id: c.id,
          vector: vectors[idx],
          // Record the model that actually produced the vector rather than a
          // hardcoded name, so a row can never misreport its own provenance.
          model: embeddingModel,
        })),
        tables
      );

      processedSubmissions.push({
        submission_id: sub.submission_id,
        student_id: sub.student_id,
        content: sub.content,
        chunks: chunksWithIds.map((c, idx) => ({ ...c, embedding: vectors[idx] })),
        answerTexts: answerTextsMap,
      });

      processedCount++;
      if (processedCount % 5 === 0) {
        await updateDetection(detectionId, { processed_submissions: processedCount }, tables);
      }
    }

    // Comparison Phase — every unique pair (i < j)
    const processedSubmissionIds = processedSubmissions.map(s => s.submission_id);
    const dbMatches = await findSimilarChunksLateral(processedSubmissionIds, 10, tables);
    
    // Group dbMatches by submission pair for fast lookup
    const pairMatches = new Map<string, SimilarChunkMatch[]>();
    for (const m of dbMatches) {
       const id1 = m.source_submission_id < m.target_submission_id ? m.source_submission_id : m.target_submission_id;
       const id2 = m.source_submission_id < m.target_submission_id ? m.target_submission_id : m.source_submission_id;
       const key = `${id1}:${id2}`;
       if (!pairMatches.has(key)) pairMatches.set(key, []);
       pairMatches.get(key)!.push(m);
    }
    
    // Pre-calculate BM25 corpus stats per question
    const corpusStatsPerQuestion = new Map<number, BM25Stats>();
    const allQIndices = new Set<number>();
    for (const sub of processedSubmissions) {
      if (sub.answerTexts) {
        for (const qIdx of sub.answerTexts.keys()) allQIndices.add(qIdx);
      }
    }
    for (const qi of allQIndices) {
      const textsForQ: string[] = [];
      for (const sub of processedSubmissions) {
        if (sub.answerTexts?.has(qi)) textsForQ.push(sub.answerTexts.get(qi)!);
      }
      corpusStatsPerQuestion.set(qi, calculateBM25CorpusStats(textsForQ));
    }

    // First pass: compute raw per-question scores for every unique pair.
    const rawPairs: Array<{ subA: SubmissionData; subB: SubmissionData; raw: PairRawResult }> = [];
    for (let i = 0; i < processedSubmissions.length; i++) {
      for (let j = i + 1; j < processedSubmissions.length; j++) {
        const subA = processedSubmissions[i];
        const subB = processedSubmissions[j];

        if (subA.student_id === subB.student_id) continue;

        const key = subA.submission_id < subB.submission_id
          ? `${subA.submission_id}:${subB.submission_id}`
          : `${subB.submission_id}:${subA.submission_id}`;

        const matchesForPair = pairMatches.get(key) ?? [];
        const raw = calculatePairRawScores(subA, subB, matchesForPair, corpusStatsPerQuestion);
        rawPairs.push({ subA, subB, raw });
      }
    }

    // Compute per-question distribution stats if we have enough pairs.
    // Below MIN_PAIRS_FOR_ZSCORE the class size is too small for std to be
    // meaningful — fall back to the fixed weighted formula.
    const useZScore = rawPairs.length >= MIN_PAIRS_FOR_ZSCORE;
    const distributions = useZScore
      ? computeQuestionDistributions(rawPairs.map(p => p.raw))
      : null;

    console.log(`[PDS] Scoring ${rawPairs.length} pairs using ${useZScore ? 'z-score (relative)' : 'weighted (fallback)'} mode`);
    console.log(`[PDS] provider=${providerName} model=${embeddingModelUsed ?? 'n/a'} dims=${embeddingDimsUsed ?? 'n/a'} tables=${tables.chunks}`);

    // Second pass: finalize each pair's combined score and filter by threshold.
    const comparisons = [];
    const flags = [];

    for (const { subA, subB, raw } of rawPairs) {
      const result = finalizePairScore(raw, distributions);
      const riskLevel = calculateRiskLevel(result.combinedScore);

      if (result.combinedScore >= SIMILARITY_THRESHOLDS.LOW) {
        const comparisonId = crypto.randomUUID();
        comparisons.push({
          id: comparisonId,
          source_submission_id: subA.submission_id,
          target_submission_id: subB.submission_id,
          semantic_score: result.semanticScore,
          lexical_score: result.lexicalScore,
          combined_score: result.combinedScore,
          risk_level: riskLevel,
          matched_chunks: {
            chunks: result.matchedChunksData,
            per_question_scores: result.perQuestionScores,
          },
          compared_at: new Date().toISOString(),
        });

        flags.push({ comparison_id: comparisonId, submission_id: subA.submission_id, status: 'pending', is_false_positive: false });
        flags.push({ comparison_id: comparisonId, submission_id: subB.submission_id, status: 'pending', is_false_positive: false });
      }
    }

    if (comparisons.length > 0) await insertComparisons(comparisons, tables);
    if (flags.length > 0) await insertFlags(flags, tables);

    await updateDetection(detectionId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      processed_submissions: processedCount,
    }, tables);

    await insertAuditLog({
      user_id: userId,
      action: 'run_detection',
      entity_type: 'detection',
      entity_id: detectionId,
      metadata: { assignment_id: assignmentId, matches_found: comparisons.length },
    }, tables);

  } catch (error: any) {
    console.error('[PDS] Detection failed:', error);
    await updateDetection(detectionId, {
      status: 'failed',
      error_message: error.message,
    }, tables);
  }
}

/**
 * First pass: compute raw per-question semantic and lexical scores for a pair.
 * No combining or thresholding yet — that happens in finalizePairScore once
 * the class-wide distribution stats are known.
 *
 * For each shared question:
 * 1. Semantic: sum of best-match cosines (from DB LATERAL join), normalized
 *    by the larger chunk count. Pure raw signal — no gate.
 * 2. Lexical: BM25 on per-question answer text.
 *
 * Evidence chunks use a separate DISPLAY threshold (0.5) that only controls
 * which chunks appear in the side-by-side panel — it never affects scoring.
 */
function calculatePairRawScores(
  subA: SubmissionData,
  subB: SubmissionData,
  matchesForPair: SimilarChunkMatch[],
  corpusStatsPerQuestion: Map<number, BM25Stats>
): PairRawResult {
  const chunksA = subA.chunks ?? [];
  const chunksB = subB.chunks ?? [];
  const matchedChunksData: any[] = [];
  const perQuestionRaw: PerQuestionRawScore[] = [];

  if (chunksA.length === 0 || chunksB.length === 0) {
    return { perQuestionRaw: [], matchedChunksData: [] };
  }

  const groupA = new Map<number, ChunkData[]>();
  const groupB = new Map<number, ChunkData[]>();
  for (const c of chunksA) {
    if (!groupA.has(c.question_index)) groupA.set(c.question_index, []);
    groupA.get(c.question_index)!.push(c);
  }
  for (const c of chunksB) {
    if (!groupB.has(c.question_index)) groupB.set(c.question_index, []);
    groupB.get(c.question_index)!.push(c);
  }

  const allQIs = new Set([...groupA.keys(), ...groupB.keys()]);

  for (const qi of allQIs) {
    const qChunksA = groupA.get(qi) ?? [];
    const qChunksB = groupB.get(qi) ?? [];
    if (qChunksA.length === 0 || qChunksB.length === 0) continue;

    let sumBestCosine = 0;
    const evidenceMap = new Map<string, any>();

    const tryRegisterEvidence = (simScore: number, sourceId: string, targetId: string, sourceText: string, targetText: string) => {
      if (simScore <= EVIDENCE_DISPLAY_THRESHOLD) return;
      const key = `${sourceId}:${targetId}`;
      const existing = evidenceMap.get(key);
      if (!existing || simScore > existing.similarity) {
        evidenceMap.set(key, {
          similarity: simScore,
          sourceText,
          targetText,
          sourceChunkId: sourceId,
          targetChunkId: targetId,
        });
      }
    };

    const aToBMatches = matchesForPair.filter(m => m.source_submission_id === subA.submission_id && m.target_submission_id === subB.submission_id && m.question_index === qi);
    const bToAMatches = matchesForPair.filter(m => m.source_submission_id === subB.submission_id && m.target_submission_id === subA.submission_id && m.question_index === qi);

    for (const cA of qChunksA) {
      const m = aToBMatches.find(x => x.source_chunk_id === cA.id);
      if (m) {
        sumBestCosine += m.similarity;
        tryRegisterEvidence(m.similarity, cA.id!, m.target_chunk_id, cA.content, m.target_content);
      }
    }

    for (const cB of qChunksB) {
      const m = bToAMatches.find(x => x.source_chunk_id === cB.id);
      if (m) {
        tryRegisterEvidence(m.similarity, m.target_chunk_id, cB.id!, m.target_content, cB.content);
      }
    }

    const semanticQ = sumBestCosine / Math.max(qChunksA.length, qChunksB.length);

    const textA = subA.answerTexts?.get(qi) ?? '';
    const textB = subB.answerTexts?.get(qi) ?? '';
    const stats = corpusStatsPerQuestion.get(qi);
    const lexicalQ = stats ? calculateBM25Similarity(textA, textB, stats) : 0;

    perQuestionRaw.push({
      question_index: qi,
      semantic_score: semanticQ,
      lexical_score: lexicalQ,
    });

    for (const [, m] of evidenceMap) {
      matchedChunksData.push({
        source_chunk_id: m.sourceChunkId,
        target_chunk_id: m.targetChunkId,
        similarity: m.similarity,
        source_text: m.sourceText,
        target_text: m.targetText,
        question_index: qi,
      });
    }
  }

  return { perQuestionRaw, matchedChunksData };
}

/**
 * Aggregates per-question distribution stats (mean, std) of semantic and
 * lexical scores across ALL pairs. These stats answer the question: "what
 * does the baseline similarity look like for this specific question?"
 *
 * A question with a constrained answer space (e.g. "what is tokenization")
 * will naturally have a high semantic mean — so being "0.75 similar" on that
 * question is unremarkable. An open-ended question with a low mean makes the
 * same 0.75 a strong outlier signal.
 */
function computeQuestionDistributions(
  allRawResults: PairRawResult[]
): Map<number, QuestionDistribution> {
  const byQuestion = new Map<number, { sems: number[]; lexs: number[] }>();

  for (const raw of allRawResults) {
    for (const q of raw.perQuestionRaw) {
      if (!byQuestion.has(q.question_index)) {
        byQuestion.set(q.question_index, { sems: [], lexs: [] });
      }
      const bucket = byQuestion.get(q.question_index)!;
      bucket.sems.push(q.semantic_score);
      bucket.lexs.push(q.lexical_score);
    }
  }

  const distributions = new Map<number, QuestionDistribution>();
  for (const [qi, { sems, lexs }] of byQuestion) {
    const semStats = calculateDistributionStats(sems);
    const lexStats = calculateDistributionStats(lexs);
    distributions.set(qi, {
      semanticMean: semStats.mean,
      semanticStd: semStats.std,
      lexicalMean: lexStats.mean,
      lexicalStd: lexStats.std,
    });
  }
  return distributions;
}

/**
 * Second pass: combine raw per-question scores into a final PairScoreResult.
 *
 * Z-score mode (distributions provided):
 *   For each question, compute how many standard deviations this pair's
 *   semantic and lexical scores are above the class mean on that question.
 *   The per-question combined score = normalize(max(z_sem, z_lex)).
 *   This flags a pair only if their similarity is unusual relative to how
 *   similar other pairs are on the same question.
 *
 * Fallback mode (distributions null, small sample):
 *   Uses the fixed weighted formula from calculateCombinedScore.
 *
 * The overall combinedScore is the mean of per-question combined scores.
 * The pair's display semanticScore and lexicalScore are raw averages (not
 * z-scores) so the UI shows interpretable numbers.
 */
function finalizePairScore(
  raw: PairRawResult,
  distributions: Map<number, QuestionDistribution> | null
): PairScoreResult {
  const perQuestionScores: PerQuestionScore[] = [];
  let totalSemanticSum = 0;
  let totalLexicalSum = 0;
  let totalCombinedSum = 0;
  let totalQuestions = 0;

  for (const q of raw.perQuestionRaw) {
    totalQuestions++;

    let combinedQ: number;
    const dist = distributions?.get(q.question_index);
    if (dist) {
      const zSem = calculateZScore(q.semantic_score, dist.semanticMean, dist.semanticStd);
      const zLex = calculateZScore(q.lexical_score, dist.lexicalMean, dist.lexicalStd);
      combinedQ = zScoreToNormalizedScore(Math.max(zSem, zLex));
    } else {
      combinedQ = calculateCombinedScore(q.semantic_score, q.lexical_score);
    }

    perQuestionScores.push({
      question_index: q.question_index,
      semantic_score: Math.round(q.semantic_score * 10000) / 10000,
      lexical_score: Math.round(q.lexical_score * 10000) / 10000,
      combined_score: Math.round(combinedQ * 10000) / 10000,
    });

    totalSemanticSum += q.semantic_score;
    totalLexicalSum += q.lexical_score;
    totalCombinedSum += combinedQ;
  }

  const semanticScore = totalQuestions > 0 ? totalSemanticSum / totalQuestions : 0;
  const lexicalScore = totalQuestions > 0 ? totalLexicalSum / totalQuestions : 0;
  const combinedScore = totalQuestions > 0 ? totalCombinedSum / totalQuestions : 0;

  return { combinedScore, semanticScore, lexicalScore, perQuestionScores, matchedChunksData: raw.matchedChunksData };
}
