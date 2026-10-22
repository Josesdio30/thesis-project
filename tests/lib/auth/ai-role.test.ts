import { isAiInstructorRole } from '@/lib/auth/ai-role';

describe('R-ROLE-2 / FR-ACS-1: AI instructor roles', () => {
  test.each(['TEACHER', 'GURU', 'ADMIN'])('R-ROLE-2: %s may use the AI features', role => {
    expect(isAiInstructorRole(role)).toBe(true);
  });

  test('R-ROLE-2: GURU is accepted exactly like TEACHER (Q-02)', () => {
    expect(isAiInstructorRole('GURU')).toBe(isAiInstructorRole('TEACHER'));
  });

  test.each(['teacher', ' guru ', 'Admin\n'])('role %j is matched case- and whitespace-insensitively', role => {
    expect(isAiInstructorRole(role)).toBe(true);
  });

  test.each(['STUDENT', 'SISWA', '', 'TEACHERS', 'ADMINISTRATOR'])('role %j may not use the AI features', role => {
    expect(isAiInstructorRole(role)).toBe(false);
  });

  test.each([null, undefined])('a missing role (%p) is rejected', role => {
    expect(isAiInstructorRole(role)).toBe(false);
  });
});
