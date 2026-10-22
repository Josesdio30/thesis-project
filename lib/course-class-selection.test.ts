import {
  buildClassScopedCourseQuery,
  buildPeopleQuery,
  selectClassCourse,
  selectInitialSessionId,
} from './course-class-selection';

const classCourses = [
  {
    class_id: 10,
    class_name: 'Grade 10 Math',
    sessions: [
      { id: 101, title: 'Algebra' },
      { id: 102, title: 'Statistics' },
    ],
  },
  {
    class_id: 11,
    class_name: 'Grade 11 Math',
    sessions: [{ id: 201, title: 'Calculus' }],
  },
];

describe('course class selection', () => {
  it('passes classId through course card links when available', () => {
    expect(buildClassScopedCourseQuery('MATH101', 10)).toEqual({
      code: 'MATH101',
      classId: 10,
    });
  });

  it('omits classId from course card links when unavailable', () => {
    expect(buildClassScopedCourseQuery('MATH101', null)).toEqual({
      code: 'MATH101',
    });
  });

  it('selects the class course from the classId route parameter first', () => {
    expect(selectClassCourse(classCourses, '11', 101)?.class_name).toBe('Grade 11 Math');
  });

  it('falls back to the class course containing the active session', () => {
    expect(selectClassCourse(classCourses, null, 102)?.class_name).toBe('Grade 10 Math');
  });

  it('chooses the first session from the selected class course when no sessionId is provided', () => {
    expect(selectInitialSessionId(classCourses, '11', null)).toBe(201);
  });

  it('keeps an explicit sessionId when provided', () => {
    expect(selectInitialSessionId(classCourses, '11', '102')).toBe(102);
  });

  it('adds classId to people API queries', () => {
    expect(buildPeopleQuery('teacher', 10).toString()).toBe('type=teacher&classId=10');
  });
});
