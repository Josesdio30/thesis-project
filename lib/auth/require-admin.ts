import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

export interface AdminUser {
  id: string;
  name: string | null;
}

export type RequireAdminResult =
  | { ok: true; user: AdminUser }
  | { ok: false; response: NextResponse };

/**
 * Guard for admin-only API routes. Returns the admin user on success, or a
 * ready-to-return 401/403 NextResponse otherwise.
 */
export async function requireAdmin(): Promise<RequireAdminResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const user = await prisma.app_user.findUnique({
    where: { id: parseInt(session.user.id, 10) },
    include: { app_user_role: { include: { enumeration: true } } },
  });

  const isAdmin = user?.app_user_role?.some(
    role => role.enumeration?.name?.toLowerCase() === 'admin' && role.is_active
  );

  if (!user || !isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, user: { id: session.user.id, name: user.nama_lengkap } };
}
