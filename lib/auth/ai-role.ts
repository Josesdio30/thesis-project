const AI_INSTRUCTOR_ROLES = new Set(['GURU', 'TEACHER', 'ADMIN']);

export function isAiInstructorRole(role: string | null | undefined): boolean {
  return AI_INSTRUCTOR_ROLES.has(role?.trim().toUpperCase() ?? '');
}
