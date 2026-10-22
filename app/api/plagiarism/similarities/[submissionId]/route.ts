
import { requireCourseManager, teacherIdsForSubmission } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { queryLMS } from '@/lib/lms-db';
import { getComparisonsBySubmissionId, pdsTables } from '@/lib/db2/pds-repo';

interface SimilarityMatch {
  comparison_id: string;
  target_student_name: string;
  similarity_score: number; // Combined score
  risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  match_count: number; // Number of matched chunks
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { submissionId } = await params;

    const numericSubId = parseInt(submissionId, 10);
    if (isNaN(numericSubId)) return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    const access = await requireCourseManager(() => teacherIdsForSubmission(numericSubId));
    if (!access.ok) return access.response;

    const studentSql = `
      SELECT u.nama_lengkap as name
      FROM assignment_submissions s
      JOIN app_user u ON s.student_id = u.id
      WHERE s.id = $1
    `;
    const studentData = await queryLMS<{ name: string }>(studentSql, [numericSubId]);
    if (studentData.length === 0) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });

    const studentName = studentData[0].name;

    // Fetch comparisons where this submission is either source or target
    const comparisons = await getComparisonsBySubmissionId(submissionId, tables);

    if (comparisons.length === 0) {
      return NextResponse.json({
        student_name: studentName,
        submission_id: submissionId,
        matches: []
      });
    }

    // Resolve the "other student" name for each comparison
    const otherSubIds = comparisons.map(c =>
      c.source_submission_id === submissionId ? c.target_submission_id : c.source_submission_id
    );
    const uniqueOtherIds = [...new Set(otherSubIds)].map(id => parseInt(id, 10));

    const targetSql = `
      SELECT s.id::text as submission_id, u.nama_lengkap as name
      FROM assignment_submissions s
      JOIN app_user u ON s.student_id = u.id
      WHERE s.id = ANY($1::int[])
    `;

    const targetStudents = await queryLMS<{ submission_id: string, name: string }>(targetSql, [uniqueOtherIds]);

    const targetNameMap = new Map<string, string>();
    targetStudents.forEach(t => targetNameMap.set(t.submission_id, t.name));

    const matches: SimilarityMatch[] = comparisons.map(comp => {
      const otherSubId = comp.source_submission_id === submissionId
        ? comp.target_submission_id
        : comp.source_submission_id;

      return {
        comparison_id: comp.id,
        target_student_name: targetNameMap.get(otherSubId) || 'Unknown Student',
        similarity_score: comp.combined_score,
        risk_level: comp.risk_level,
        match_count: Array.isArray(comp.matched_chunks)
          ? comp.matched_chunks.length
          : ((comp.matched_chunks as any)?.chunks?.length ?? 0)
      };
    });

    return NextResponse.json({
      student_name: studentName,
      submission_id: submissionId,
      matches
    });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
