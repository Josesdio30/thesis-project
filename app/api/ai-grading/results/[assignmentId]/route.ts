import { NextRequest, NextResponse } from 'next/server';
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import {
  getGradingResultsByJobAndStudent,
  getLatestCompletedJobByAssignment,
  acsTables,
} from '@/lib/db2/acs-repo';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> }
) {
  const tables = acsTables(resolveProviderName());
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { assignmentId } = await params;
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get('studentId');

  if (!assignmentId) {
    return NextResponse.json(
      { success: false, error: 'Missing assignmentId' },
      { status: 400 }
    );
  }
  if (!studentId) {
    return NextResponse.json(
      { success: false, error: 'Missing studentId query parameter' },
      { status: 400 }
    );
  }

  const access = await requireCourseManager(() => teacherIdsForAssignment(assignmentId));
  if (!access.ok) return access.response;

  const job = await getLatestCompletedJobByAssignment(assignmentId, tables);
  if (!job) {
    return NextResponse.json({
      success: true,
      data: { job: null, results: [] },
    });
  }

  const results = await getGradingResultsByJobAndStudent(job.id, studentId, tables);

  return NextResponse.json({
    success: true,
    data: {
      job: {
        id: job.id,
        assignment_id: job.assignment_id,
        completed_at: job.completed_at,
      },
      results,
    },
  });
}
