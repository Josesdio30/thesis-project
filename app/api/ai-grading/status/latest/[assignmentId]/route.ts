import { NextRequest, NextResponse } from 'next/server';
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { resolveProviderName } from '@/lib/ai';
import {
  countGradingResultsByJobId,
  getGradingResultsByJobId,
  getLatestGradingJobByAssignment,
  acsTables,
} from '@/lib/db2/acs-repo';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const tables = acsTables(resolveProviderName());
  const { assignmentId } = await params;

  if (!assignmentId) {
    return NextResponse.json({ success: false, error: 'Missing assignmentId' }, { status: 400 });
  }

  const access = await requireCourseManager(() => teacherIdsForAssignment(assignmentId));
  if (!access.ok) return access.response;

  const job = await getLatestGradingJobByAssignment(assignmentId, tables);

  if (!job) {
    return NextResponse.json({
      success: true,
      data: null,
    });
  }

  const items_processed = await countGradingResultsByJobId(job.id, tables);

  // Average AI score percentage across all results, where score and max_score are numeric.
  let averageScorePct: number | null = null;
  if (job.status === 'completed') {
    const results = await getGradingResultsByJobId(job.id, tables);
    const valid = results.filter(
      r => r.score !== null && r.score !== undefined && r.max_score > 0
    );
    if (valid.length > 0) {
      const sum = valid.reduce(
        (acc, r) => acc + ((r.score ?? 0) / r.max_score) * 100,
        0
      );
      averageScorePct = sum / valid.length;
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      job_id: job.id,
      assignment_id: job.assignment_id,
      status: job.status,
      total_students: job.total_students,
      items_processed,
      completed_at: job.completed_at,
      created_at: job.created_at,
      average_score_pct: averageScorePct,
    },
  });
}
