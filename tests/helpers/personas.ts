/**
 * Fixed test personas. IDs are stable so ownership fixtures can refer to them:
 * the "owner" teacher is the one assigned to the fixture class_course, the
 * "other" teacher teaches somewhere else.
 *
 * Role names match the local database (`enumeration.category = 'USER_ROLE'`:
 * STUDENT=1, TEACHER=2, ADMIN=3). GURU is an accepted alias of TEACHER (Q-02).
 */
export type PersonaName =
  | 'anonymous'
  | 'student'
  | 'otherStudent'
  | 'teacherOwner'
  | 'teacherOther'
  | 'guruOwner'
  | 'admin';

export interface Persona {
  name: PersonaName;
  id: number | null;
  role: 'STUDENT' | 'TEACHER' | 'GURU' | 'ADMIN' | null;
}

export const PERSONAS: Readonly<Record<PersonaName, Persona>> = Object.freeze({
  anonymous: { name: 'anonymous', id: null, role: null },
  student: { name: 'student', id: 101, role: 'STUDENT' },
  otherStudent: { name: 'otherStudent', id: 102, role: 'STUDENT' },
  teacherOwner: { name: 'teacherOwner', id: 201, role: 'TEACHER' },
  teacherOther: { name: 'teacherOther', id: 202, role: 'TEACHER' },
  guruOwner: { name: 'guruOwner', id: 201, role: 'GURU' },
  admin: { name: 'admin', id: 301, role: 'ADMIN' },
});

/** The NextAuth session `getServerSession` would return, or null when anonymous. */
export function sessionFor(persona: Persona) {
  if (persona.id === null) return null;
  return {
    user: {
      id: String(persona.id),
      name: `${persona.name} user`,
      email: `${persona.name}@example.test`,
      username: persona.name,
      role: persona.role ?? undefined,
    },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

/**
 * The `app_user` row (with roles) that routes load via Prisma to re-check the
 * role in the database (`requireAdmin`, admin routes, assignment setup).
 */
export function userRecordFor(persona: Persona) {
  if (persona.id === null) return null;
  return {
    id: persona.id,
    nama_lengkap: `${persona.name} user`,
    user_name: persona.name,
    email: `${persona.name}@example.test`,
    is_active: true,
    is_deleted: false,
    student_details: persona.role === 'STUDENT' ? { nis: `NIS${persona.id}` } : null,
    teacher_details:
      persona.role === 'TEACHER' || persona.role === 'GURU' ? { kode_guru: `G${persona.id}` } : null,
    app_user_role: [{ is_active: true, enumeration: { name: persona.role } }],
  };
}
