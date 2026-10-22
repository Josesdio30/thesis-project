
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getLatestDetectionForAssignment, pdsTables } from '@/lib/db2/pds-repo';

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
    const access = await requireCourseManager(() => teacherIdsForAssignment(assignmentId));
    if (!access.ok) return access.response;
    const detection = await getLatestDetectionForAssignment(assignmentId, tables);

    if (!detection) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json(detection);

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
