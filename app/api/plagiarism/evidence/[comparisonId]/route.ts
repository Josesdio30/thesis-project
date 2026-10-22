
import { requireCourseManager, teacherIdsForSubmission } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { queryLMS } from '@/lib/lms-db';
import {
  getComparisonById,
  getFlagByComparisonAndSubmission,
  pdsTables
} from '@/lib/db2/pds-repo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ comparisonId: string }> }
) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { comparisonId } = await params;

    // Accept optional submissionId query param to identify which student is viewing
    const url = new URL(request.url);
    const viewingSubmissionId = url.searchParams.get('submissionId');

    // 1. Fetch Comparison Data (DB2)
    const comparison = await getComparisonById(comparisonId, tables);

    if (!comparison) {
      return NextResponse.json({ error: 'Comparison not found' }, { status: 404 });
    }

    const access = await requireCourseManager(() => teacherIdsForSubmission(comparison.source_submission_id));
    if (!access.ok) return access.response;

    // 2. Determine which submission is the "viewer" for flag lookup
    const flagSubmissionId = viewingSubmissionId
      && (viewingSubmissionId === comparison.source_submission_id || viewingSubmissionId === comparison.target_submission_id)
      ? viewingSubmissionId
      : comparison.source_submission_id;

    const flag = await getFlagByComparisonAndSubmission(
      comparisonId,
      flagSubmissionId
    );

    // 3. Fetch Full Text Content (LMS)
    const sourceId = parseInt(comparison.source_submission_id);
    const targetId = parseInt(comparison.target_submission_id);

    const sql = `
      SELECT
        s.id::text as submission_id,
        u.nama_lengkap as student_name,
        string_agg(a.answer_text, E'\n\n' ORDER BY q.order_number) as content
      FROM assignment_submissions s
      JOIN app_user u ON s.student_id = u.id
      JOIN assignment_answers a ON s.id = a.submission_id
      JOIN assignment_questions q ON a.question_id = q.id
      JOIN enumeration e ON q.question_type_id = e.id
      WHERE s.id IN ($1, $2)
        AND a.answer_text IS NOT NULL
        AND a.answer_text <> ''
        AND UPPER(e.name) IN ('ESSAY', 'FILE_UPLOAD')
      GROUP BY s.id, u.nama_lengkap
    `;

    const submissions = await queryLMS(sql, [sourceId, targetId]);

    const sourceSub = submissions.find(s => s.submission_id === comparison.source_submission_id);
    const targetSub = submissions.find(s => s.submission_id === comparison.target_submission_id);

    if (!sourceSub || !targetSub) {
      return NextResponse.json({ error: 'Submission content not found in LMS' }, { status: 404 });
    }

    // Parse matched_chunks: new format is { chunks, per_question_scores },
    // old format is a plain array. Handle both for backward compatibility.
    const rawMC = comparison.matched_chunks;
    const isNewFormat = rawMC && typeof rawMC === 'object' && !Array.isArray(rawMC);
    const chunks = isNewFormat ? (rawMC as any).chunks ?? [] : (Array.isArray(rawMC) ? rawMC : []);
    const perQuestionScores = isNewFormat ? (rawMC as any).per_question_scores ?? [] : [];

    return NextResponse.json({
      comparison_id: comparison.id,
      source_student: sourceSub.student_name,
      target_student: targetSub.student_name,
      source_content: sourceSub.content,
      target_content: targetSub.content,
      overall_similarity: comparison.combined_score,
      risk_level: comparison.risk_level,
      matched_chunks: chunks,
      per_question_scores: perQuestionScores,
      flag_id: flag?.id || null,
      reviewed: flag?.reviewed || false,
      is_false_positive: flag?.is_false_positive || false,
      teacher_notes: flag?.teacher_notes || null
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
