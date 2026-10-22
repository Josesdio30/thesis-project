type SessionLike = {
  id?: number | null;
};

export type ClassCourseLike = {
  class_id?: number | null;
  sessions?: SessionLike[] | null;
};

const parseRouteNumber = (value?: string | null) => {
  if (!value) return null;

  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

export const buildClassScopedCourseQuery = (courseCode: string, classId?: number | null) => ({
  code: courseCode,
  ...(classId !== null && classId !== undefined ? { classId } : {}),
});

export const buildPeopleQuery = (type: 'teacher' | 'students' | 'all', classId?: number | null) => {
  const params = new URLSearchParams({ type });

  if (classId !== null && classId !== undefined) {
    params.append('classId', classId.toString());
  }

  return params;
};

export const selectClassCourse = <T extends ClassCourseLike>(
  classCourses: T[] | null | undefined,
  classIdParam?: string | null,
  activeSessionId?: number | null
) => {
  if (!classCourses?.length) return undefined;

  const classId = parseRouteNumber(classIdParam);
  if (classId !== null) {
    const classCourse = classCourses.find(cc => cc.class_id === classId);
    if (classCourse) return classCourse;
  }

  if (activeSessionId !== null && activeSessionId !== undefined) {
    const classCourse = classCourses.find(cc => cc.sessions?.some(session => session.id === activeSessionId));
    if (classCourse) return classCourse;
  }

  return classCourses[0];
};

export const selectInitialSessionId = <T extends ClassCourseLike>(
  classCourses: T[] | null | undefined,
  classIdParam?: string | null,
  sessionIdParam?: string | null
) => {
  const sessionId = parseRouteNumber(sessionIdParam);
  if (sessionId !== null) return sessionId;

  const classCourse = selectClassCourse(classCourses, classIdParam);
  return classCourse?.sessions?.[0]?.id ?? null;
};
