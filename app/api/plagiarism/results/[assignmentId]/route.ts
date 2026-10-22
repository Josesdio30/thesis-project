
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { queryLMS } from '@/lib/lms-db';
import { getComparisonsBySubmissionIds, pdsTables } from '@/lib/db2/pds-repo';

interface StudentResult {
  student_id: string;
  student_name: string;
  submission_id: string;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  max_similarity: number;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { assignmentId } = await params;

    const numericId = parseInt(assignmentId, 10);
    if (isNaN(numericId)) {
        return NextResponse.json({ error: 'Invalid Assignment ID' }, { status: 400 });
    }
    const access = await requireCourseManager(() => teacherIdsForAssignment(numericId));
    if (!access.ok) return access.response;

    const sql = `
      SELECT
        s.id::text as submission_id,
        s.student_id::text as student_id,
        u.nama_lengkap as student_name
      FROM assignment_submissions s
      JOIN app_user u ON s.student_id = u.id
      WHERE s.assignment_id = $1
    `;

    const submissions = await queryLMS<{ submission_id: string, student_id: string, student_name: string }>(sql, [numericId]);

    if (submissions.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch comparisons where any of these submissions appear as source OR target
    const submissionIds = submissions.map(s => s.submission_id);
    const submissionIdSet = new Set(submissionIds);
    const comparisons = await getComparisonsBySubmissionIds(submissionIds, tables);

    // Aggregate stats for each submission from both directions
    const statsMap = new Map<string, { high: number, medium: number, low: number, max: number }>();

    comparisons.forEach(comp => {
      // For each comparison, credit both the source and target student
      const involvedIds: string[] = [];
      if (submissionIdSet.has(comp.source_submission_id)) involvedIds.push(comp.source_submission_id);
      if (submissionIdSet.has(comp.target_submission_id)) involvedIds.push(comp.target_submission_id);

      for (const subId of involvedIds) {
        const current = statsMap.get(subId) || { high: 0, medium: 0, low: 0, max: 0 };

        if (comp.risk_level === 'HIGH') current.high++;
        else if (comp.risk_level === 'MEDIUM') current.medium++;
        else if (comp.risk_level === 'LOW') current.low++;

        if (comp.combined_score > current.max) {
          current.max = comp.combined_score;
        }

        statsMap.set(subId, current);
      }
    });

    const results: StudentResult[] = submissions.map(sub => {
      const stats = statsMap.get(sub.submission_id) || { high: 0, medium: 0, low: 0, max: 0 };
      return {
        student_id: sub.student_id,
        student_name: sub.student_name,
        submission_id: sub.submission_id,
        high_risk_count: stats.high,
        medium_risk_count: stats.medium,
        low_risk_count: stats.low,
        max_similarity: stats.max
      };
    });

    return NextResponse.json(results);

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
