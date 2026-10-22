import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth/require-admin';
import { PERSONAS, sessionFor, userRecordFor } from '../../helpers/personas';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => ({
  prisma: { app_user: { findUnique: jest.fn() } },
}));

const mockSession = getServerSession as jest.Mock;
const mockFindUser = prisma.app_user.findUnique as jest.Mock;

async function body(res: Response) {
  return res.json();
}

describe('FR-ADM-1: requireAdmin guard', () => {
  test('FR-ADM-1: no session → 401 Unauthorized', async () => {
    mockSession.mockResolvedValue(null);

    const result = await requireAdmin();

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
    expect(await body(result.response)).toEqual({ success: false, error: 'Unauthorized' });
    expect(mockFindUser).not.toHaveBeenCalled();
  });

  test('FR-ADM-1: a session without a user id → 401', async () => {
    mockSession.mockResolvedValue({ user: { name: 'x' } });
    const result = await requireAdmin();
    expect(!result.ok && result.response.status).toBe(401);
  });

  test.each(['student', 'teacherOwner', 'guruOwner'] as const)(
    'FR-ADM-1: %s → 403 Admin access required',
    async name => {
      const persona = PERSONAS[name];
      mockSession.mockResolvedValue(sessionFor(persona));
      mockFindUser.mockResolvedValue(userRecordFor(persona));

      const result = await requireAdmin();

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.response.status).toBe(403);
      expect(await body(result.response)).toEqual({ success: false, error: 'Admin access required' });
    }
  );

  test('FR-ADM-1: the role is re-checked in the database, not taken from the JWT', async () => {
    // JWT claims ADMIN, database says STUDENT.
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    mockFindUser.mockResolvedValue(userRecordFor(PERSONAS.student));

    const result = await requireAdmin();

    expect(!result.ok && result.response.status).toBe(403);
    expect(mockFindUser).toHaveBeenCalledWith({
      where: { id: 301 },
      include: { app_user_role: { include: { enumeration: true } } },
    });
  });

  test('FR-ADM-1: an inactive ADMIN role row does not grant access', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    mockFindUser.mockResolvedValue({
      ...userRecordFor(PERSONAS.admin),
      app_user_role: [{ is_active: false, enumeration: { name: 'ADMIN' } }],
    });

    const result = await requireAdmin();

    expect(!result.ok && result.response.status).toBe(403);
  });

  test('FR-ADM-1: a user missing from the database → 403', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    mockFindUser.mockResolvedValue(null);

    const result = await requireAdmin();

    expect(!result.ok && result.response.status).toBe(403);
  });

  test('FR-ADM-1: a role row without an enumeration is ignored', async () => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    mockFindUser.mockResolvedValue({ ...userRecordFor(PERSONAS.admin), app_user_role: [{ is_active: true }] });

    const result = await requireAdmin();

    expect(!result.ok && result.response.status).toBe(403);
  });

  test.each(['ADMIN', 'admin', 'Admin'])('FR-ADM-1: active role %j → ok with the admin identity', async roleName => {
    mockSession.mockResolvedValue(sessionFor(PERSONAS.admin));
    mockFindUser.mockResolvedValue({
      ...userRecordFor(PERSONAS.admin),
      app_user_role: [
        { is_active: true, enumeration: { name: 'TEACHER' } },
        { is_active: true, enumeration: { name: roleName } },
      ],
    });

    const result = await requireAdmin();

    expect(result).toEqual({ ok: true, user: { id: '301', name: 'admin user' } });
  });
});
