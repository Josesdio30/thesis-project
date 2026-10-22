import { NextRequest, NextResponse } from 'next/server';
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { resolveProviderName } from '@/lib/ai';
import {
  countGradingResultsByJobId,
  getGradingJobById,
  getGradingResultsByJobId,
  acsTables,
} from '@/lib/db2/acs-repo';

export async function GET(request: NextRequest) {
  const tables = acsTables(resolveProviderName());
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ success: false, error: 'Missing jobId' }, { status: 400 });
  }

  const data = await getGradingJobById(jobId, tables);

  if (!data) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }

  const access = await requireCourseManager(() => teacherIdsForAssignment(data.assignment_id));
  if (!access.ok) return access.response;

  const count = await countGradingResultsByJobId(jobId, tables);
  const studentGradeFeedback = await getGradingResultsByJobId(jobId, tables);

  return NextResponse.json({
    success: true,
    data: {
      ...data,
      items_processed: count
    },
    resultData: {
      total_students: data.total_students,
    },
    studentGradeFeedback
  });
}
