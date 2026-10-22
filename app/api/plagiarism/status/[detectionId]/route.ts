
import { requireCourseManager, teacherIdsForAssignment } from '@/lib/auth/course-access';
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { getDetectionStatus, pdsTables } from '@/lib/db2/pds-repo';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ detectionId: string }> }
) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { detectionId } = await params;

    if (!detectionId) {
      return NextResponse.json({ error: 'Missing detection ID' }, { status: 400 });
    }

    const data = await getDetectionStatus(detectionId, tables);

    if (!data) {
      return NextResponse.json({ error: 'Detection not found' }, { status: 404 });
    }

    const access = await requireCourseManager(() => teacherIdsForAssignment(data.assignment_id));
    if (!access.ok) return access.response;

    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
