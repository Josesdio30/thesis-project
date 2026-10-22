import { acsTables, insertGradingResult, insertTokenUsage } from '@/lib/db2/acs-repo';
import { incrementNullFallback, insertLocalTokenUsage } from '@/lib/ai-local/acs-local-repo';
import { getEffectiveAiConfig } from '@/lib/ai-config';
import { getAiProvider, resolveProviderName } from '@/lib/ai';
import { GRADING_RESULT_SCHEMA } from '@/lib/ai-local/grading-schema';
import { resolveCitations } from '@/lib/ai-local/citations';
import { resolveSystemPromptOverride, sha256Text } from '@/lib/ai-local/prompt';
import { resolveLocalAiConfig } from '@/lib/ai-local/config';
import { ANALYTIC_INSTRUCTIONS, buildAnalyticSchema, computeAnalyticScore } from '@/lib/ai-local/analytic-scoring';
import { logAudit } from '@/lib/audit';
import { GradingResult, Rubric } from '@/lib/types';
import type { RetrievedPassage } from '@/lib/ai/types';

interface GradeStudentParams {
  assignmentId: string;
  studentId: string;
  questionId: string;
  studentAnswer: string;
  rubric: Rubric;
  /** OpenAI vector store id, or a `rag_corpora` id on the local provider. */
  groundingRef: string;
  /** Purely additive. The question text materially improves local retrieval;
   *  the OpenAI path ignores it because retrieval happens server-side. */
  questionText?: string;
  jobId?: string;
  /** Teacher who triggered the grading run — used for per-teacher token audit. */
  teacherId?: string;
  teacherName?: string;
}

/** The documented fallback for an unusable model response. Kept byte-identical
 *  to the pre-refactor behaviour: it is what the frozen validation run
 *  measured, so changing it would invalidate the comparison. */
function nullResult(maxScore: number, feedback: string): GradingResult {
  return {
    score: null,
    max_score: maxScore,
    qualitative_grade: null,
    feedback,
    citations: [],
    confidence: 'low',
    rubric_alignment: {},
    language_detected: 'en',
    token_usage_estimate: 0,
  };
}

export async function gradeStudentAnswer({
  assignmentId,
  studentId,
  questionId,
  studentAnswer,
  rubric,
  groundingRef,
  questionText,
  jobId,
  teacherId,
  teacherName,
}: GradeStudentParams) {
  try {
    const config = await getEffectiveAiConfig();
    const providerName = resolveProviderName();
    const provider = getAiProvider(providerName);
    const isLocal = providerName === 'local';
    // Calibration studies swap the prompt without touching ai_config, which is
    // the frozen record of the OpenAI baseline.
    const promptOverride = resolveSystemPromptOverride(providerName);
    const systemPrompt = promptOverride?.text ?? config.systemPrompt;

    // Resolved on the local path only, so a bad LOCAL_SCORING_MODE cannot break the OpenAI baseline.
    const criteriaNames = Object.keys(rubric.criteria ?? {});
    const analytic = isLocal && resolveLocalAiConfig().scoringMode === 'analytic' && criteriaNames.length > 0;

    // OpenAI resolves grounding server-side via file_search and reports 0 ms;
    // the local provider does the vector search here and reports it.
    const { grounding, retrievalMs } = await provider.retrieval.retrieve({
      corpusRef: groundingRef,
      queryText: [questionText ?? '', ...Object.keys(rubric.criteria ?? {}), studentAnswer]
        .filter(Boolean)
        .join('\n'),
    });

    const messagePayload = {
      question_id: questionId,
      student_answer: studentAnswer,
      rubric: rubric,
      output_format: 'json',
    };

    const response = await provider.llm.completeJson<GradingResult>({
      // The digest below hashes the base prompt; the appended block is versioned in code.
      system: analytic ? `${systemPrompt}\n\n${ANALYTIC_INSTRUCTIONS(criteriaNames)}` : systemPrompt,
      user: JSON.stringify(messagePayload),
      schema: analytic ? buildAnalyticSchema(criteriaNames) : GRADING_RESULT_SCHEMA,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      grounding,
    });

    let gradingResult: GradingResult;
    let usedNullFallback = false;
    let scoreClampedFrom: number | null = null;
    let criterionLevels: unknown = null;
    let modelScore: number | null | undefined;
    let analyticFallback = false;

    if (response.status === 'completed' && response.data) {
      // Strip criterion_levels so the stored row and the API shape stay unchanged.
      const { criterion_levels: levels, ...rest } = response.data as GradingResult & { criterion_levels?: unknown };
      gradingResult = rest;
      criterionLevels = levels ?? null;

      if (analytic) {
        const computed = computeAnalyticScore(levels, rubric.criteria, rubric.max_score);
        if (computed !== null) {
          modelScore = gradingResult.score;
          gradingResult.score = computed;
          // The computed score is on the rubric scale; the model's declared max may not be.
          gradingResult.max_score = rubric.max_score;
        } else {
          analyticFallback = true;
        }
      }

      // Cross-check emitted labels against what was actually retrieved and drop
      // anything invented. The OpenAI path keeps its own citation strings.
      if (grounding.kind === 'passages') {
        gradingResult.citations = resolveCitations(
          gradingResult.citations,
          grounding.passages as RetrievedPassage[]
        );
      }

      // Models occasionally step outside the rubric scale (observed: 130/100 on
      // strong agama answers). Stored as-is a teacher would see 130 out of 100,
      // so clamp here and keep the original in the audit entry.
      const maxScore = rubric.max_score;
      const score = gradingResult.score;
      if (typeof score === 'number' && typeof maxScore === 'number' && (score < 0 || score > maxScore)) {
        scoreClampedFrom = score;
        gradingResult.score = Math.min(maxScore, Math.max(0, score));
      }
    } else if (response.status === 'completed') {
      gradingResult = nullResult(rubric.max_score, 'Error parsing AI response. Please review manually.');
      usedNullFallback = true;
    } else {
      console.error('Response failed:', response.rawStatus, response.error);
      gradingResult = nullResult(
        rubric.max_score,
        `Grading failed. Status: ${response.rawStatus}. Error: ${response.error || 'Unknown'}`
      );
      usedNullFallback = true;
    }

    const totalTokens = response.totalTokens;

    // Result rows have the same shape in both schemas, so one call with the
    // provider's table set covers both.
    await insertGradingResult(
      {
        job_id: jobId,
        assignment_id: assignmentId,
        student_id: studentId,
        question_id: questionId,
        score: gradingResult.score,
        max_score: gradingResult.max_score,
        qualitative_grade: gradingResult.qualitative_grade,
        feedback: gradingResult.feedback,
        citations: gradingResult.citations,
        confidence: gradingResult.confidence,
        rubric_alignment: gradingResult.rubric_alignment,
        language_detected: gradingResult.language_detected,
      },
      acsTables(providerName)
    );

    // A silent null fallback is the most dangerous failure mode here: the
    // harness filters nulls out of its medians, so a half-failed run reports a
    // better-looking median over fewer samples. Counting it makes that visible.
    if (usedNullFallback && isLocal && jobId) {
      await incrementNullFallback(jobId);
    }

    if (isLocal) {
      await insertLocalTokenUsage({
        job_id: jobId,
        assignment_id: assignmentId,
        student_id: studentId,
        tokens_used: totalTokens,
        prompt_tokens: response.promptTokens,
        completion_tokens: response.completionTokens,
        latency_ms: response.latencyMs,
        load_ms: response.loadMs,
        eval_tokens_per_sec: response.tokensPerSec,
        retrieval_ms: retrievalMs,
        model: response.model,
      });
    } else if (totalTokens > 0) {
      const cost = (totalTokens / 1000000) * 10;

      await insertTokenUsage({
        job_id: jobId,
        assignment_id: assignmentId,
        student_id: studentId,
        tokens_used: totalTokens,
        estimated_cost: cost,
      });
    }

    // Audit: one entry per grading call, attributed to the triggering teacher.
    // `tokens_used` and `model` must keep these exact key names —
    // getTokenUsageByTeacher() reads details->>'tokens_used'.
    await logAudit({
      actorUserId: teacherId ?? null,
      actorName: teacherName ?? null,
      action: 'ai.grading.call',
      entityType: 'assignment',
      entityId: assignmentId,
      details: {
        student_id: studentId,
        question_id: questionId,
        job_id: jobId ?? null,
        model: response.model,
        tokens_used: totalTokens,
        status: response.rawStatus,
        provider: providerName,
        ...(scoreClampedFrom !== null ? { score_clamped_from: scoreClampedFrom } : {}),
        // Baseline OpenAI rows stay unchanged; only an override is worth recording there.
        ...(!isLocal && promptOverride
          ? { system_prompt_sha256: promptOverride.sha256, system_prompt_file: promptOverride.file }
          : {}),
        ...(isLocal
          ? {
              latency_ms: response.latencyMs,
              load_ms: response.loadMs,
              retrieval_ms: retrievalMs,
              passages_retrieved: grounding.kind === 'passages' ? grounding.passages.length : 0,
              null_fallback: usedNullFallback,
              retried_at_zero_temperature: response.retriedAtZeroTemperature ?? false,
              system_prompt_sha256: promptOverride?.sha256 ?? sha256Text(systemPrompt),
              system_prompt_file: promptOverride?.file ?? null,
              scoring_mode: analytic ? 'analytic' : 'holistic',
              criterion_levels: criterionLevels,
              ...(modelScore !== undefined ? { model_score: modelScore } : {}),
              ...(analyticFallback ? { analytic_fallback: true } : {}),
            }
          : {}),
      },
    });

    return gradingResult;
  } catch (error) {
    console.error('Fatal error in gradeStudentAnswer:', error);
    throw error;
  }
}
