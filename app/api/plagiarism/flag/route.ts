
import { NextResponse } from 'next/server';
import { resolveProviderName } from '@/lib/ai';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { isAdminRole, isTeacherRole, requireCourseManager, teacherIdsForSubmission } from '@/lib/auth/course-access';
import {
  insertAuditLog,
  insertTeacherAction,
  updateFlag,
  pdsTables,
  getFlagById,
} from '@/lib/db2/pds-repo';

export async function POST(request: Request) {
  try {
    const tables = pdsTables(resolveProviderName());
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isTeacherRole(session.user.role) && !isAdminRole(session.user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { flag_id, action, notes, is_false_positive } = body;

    if (!flag_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const flag = await getFlagById(flag_id, tables);
    if (!flag) return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
    const access = await requireCourseManager(() => teacherIdsForSubmission(flag.submission_id));
    if (!access.ok) return access.response;

    // 1. Update Flag
    const updatedFlag = await updateFlag(flag_id, {
        reviewed: true,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session.user.id,
        status: is_false_positive ? 'false_positive' : 'reviewed',
        is_false_positive: !!is_false_positive,
        teacher_notes: notes,
        action_taken: action,
      }, tables);

    if (!updatedFlag) {
      throw new Error('Failed to update flag');
    }

    // 2. Log Teacher Action
    try {
      await insertTeacherAction({
        flag_id: flag_id,
        teacher_id: session.user.id,
        action: action, // e.g., 'marked_false_positive', 'warning_sent'
        notes: notes,
      }, tables);
    } catch (actionError) {
       console.error('Failed to log teacher action:', actionError);
       // Non-blocking error, we continue
    }

    // 3. Log Audit
    await insertAuditLog({
      user_id: session.user.id,
      action: 'update_flag',
      entity_type: 'flag',
      entity_id: flag_id,
      metadata: { action, is_false_positive },
    }, tables);

    return NextResponse.json({ success: true, flag: updatedFlag });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
