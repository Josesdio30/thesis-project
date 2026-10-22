import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/require-admin';
import { listAuditLogs, getTokenUsageByTeacher } from '@/lib/db2/admin-repo';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const params = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(params.get('pageSize') ?? '25', 10) || 25));

  const { rows, total } = await listAuditLogs({
    action: params.get('action') || undefined,
    actorUserId: params.get('actorUserId') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  const tokenUsageByTeacher = await getTokenUsageByTeacher();

  return NextResponse.json({
    success: true,
    data: {
      logs: rows,
      tokenUsageByTeacher,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    },
  });
}
