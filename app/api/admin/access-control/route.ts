import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { prisma } from '@/lib/prisma';
import { listFeatureAccess, setFeatureAccess, type FeatureName } from '@/lib/db2/admin-repo';
import { logAudit } from '@/lib/audit';

const FEATURES: FeatureName[] = ['ai_grading', 'plagiarism'];

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const [courses, access] = await Promise.all([
    prisma.courses.findMany({
      select: {
        id: true,
        course_code: true,
        course_name: true,
        description: true,
        class_courses: {
          select: {
            is_active: true,
            classes: { select: { class_name: true, grade_level: true } },
            app_user: { select: { nama_lengkap: true } },
          },
        },
      },
      orderBy: { course_name: 'asc' },
    }),
    listFeatureAccess(),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      courses: courses.map(c => ({
        id: String(c.id),
        code: c.course_code,
        name: c.course_name,
        description: c.description,
        offerings: c.class_courses.map(cc => ({
          class_name: cc.classes?.class_name ?? null,
          grade_level: cc.classes?.grade_level ?? null,
          teacher_name: cc.app_user?.nama_lengkap ?? null,
          is_active: cc.is_active ?? false,
        })),
      })),
      // Only course-scoped records are relevant under the course-only model.
      access: access.filter(a => a.scope_type === 'course'),
    },
  });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const { course_id, feature, enabled } = (body ?? {}) as Record<string, unknown>;

  if (typeof course_id !== 'string' || course_id.trim().length === 0) {
    return NextResponse.json({ success: false, error: 'course_id is required' }, { status: 400 });
  }
  if (!FEATURES.includes(feature as FeatureName)) {
    return NextResponse.json(
      { success: false, error: 'feature must be "ai_grading" or "plagiarism"' },
      { status: 400 }
    );
  }
  if (typeof enabled !== 'boolean') {
    return NextResponse.json(
      { success: false, error: 'enabled must be a boolean' },
      { status: 400 }
    );
  }

  await setFeatureAccess({
    scope_type: 'course',
    scope_id: course_id.trim(),
    feature: feature as FeatureName,
    enabled,
    updated_by: admin.user.id,
  });

  await logAudit({
    actorUserId: admin.user.id,
    actorName: admin.user.name,
    action: 'access_control.updated',
    entityType: 'course',
    entityId: course_id.trim(),
    details: { course_id, feature, enabled },
  });

  return NextResponse.json({ success: true });
}
