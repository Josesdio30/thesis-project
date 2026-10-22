import { groupSubmissionsByCourse, type ScoreSubmission } from './score-view-utils';

const submission = (overrides: Partial<ScoreSubmission>): ScoreSubmission => ({
  id: 1,
  assignment_id: 10,
  assignment_title: 'Essay',
  assignment_total_points: 100,
  assignment_type: 'Essay',
  course_code: 'ENG101',
  course_name: 'English',
  class_name: 'A',
  session_title: 'Week 1',
  session_number: 1,
  attempt_number: 1,
  total_score: null,
  status: 'Submitted',
  status_id: 1,
  ...overrides,
});

describe('groupSubmissionsByCourse', () => {
  it('groups submissions by course and class with assignment summaries', () => {
    const courses = groupSubmissionsByCourse([
      submission({ id: 1, assignment_id: 10, assignment_title: 'Essay', total_score: 80 }),
      submission({ id: 2, assignment_id: 10, assignment_title: 'Essay', total_score: 90 }),
      submission({
        id: 3,
        assignment_id: 11,
        assignment_title: 'Quiz',
        assignment_total_points: 20,
        assignment_type: 'Quiz',
        total_score: null,
      }),
      submission({
        id: 4,
        assignment_id: 10,
        assignment_title: 'Essay',
        course_code: 'ENG101',
        course_name: 'English',
        class_name: 'B',
        total_score: 70,
      }),
    ]);

    expect(courses).toHaveLength(2);

    const classA = courses.find(course => course.class_name === 'A');
    expect(classA).toMatchObject({
      course_code: 'ENG101',
      course_name: 'English',
      class_name: 'A',
      totalSubmissions: 3,
      gradedSubmissions: 2,
      averageScore: 85,
      totalPossiblePoints: 220,
      earnedPoints: 170,
    });

    expect(classA?.assignments).toHaveLength(2);
    expect(classA?.assignments.find(assignment => assignment.assignment_id === 10)).toMatchObject({
      assignment_id: 10,
      assignment_title: 'Essay',
      totalSubmissions: 2,
      gradedSubmissions: 2,
      averageScore: 85,
      averagePercentage: 85,
    });
    expect(classA?.assignments.find(assignment => assignment.assignment_id === 11)).toMatchObject({
      assignment_id: 11,
      assignment_title: 'Quiz',
      totalSubmissions: 1,
      gradedSubmissions: 0,
      averageScore: 0,
      averagePercentage: 0,
    });

    const classB = courses.find(course => course.class_name === 'B');
    expect(classB?.assignments).toHaveLength(1);
  });

  it('orders assignments by latest submission activity', () => {
    const [course] = groupSubmissionsByCourse([
      submission({
        id: 1,
        assignment_id: 10,
        assignment_title: 'Essay',
        submitted_at: '2026-05-01T08:00:00.000Z',
      }),
      submission({
        id: 2,
        assignment_id: 11,
        assignment_title: 'Quiz',
        submitted_at: '2026-05-03T08:00:00.000Z',
      }),
      submission({
        id: 3,
        assignment_id: 12,
        assignment_title: 'Project',
        submitted_at: '2026-05-02T08:00:00.000Z',
      }),
      submission({
        id: 4,
        assignment_id: 10,
        assignment_title: 'Essay',
        submitted_at: '2026-05-04T08:00:00.000Z',
      }),
    ]);

    expect(course.assignments.map(assignment => assignment.assignment_title)).toEqual([
      'Essay',
      'Quiz',
      'Project',
    ]);
    expect(course.assignments[0].latestActivityAt).toBe('2026-05-04T08:00:00.000Z');
  });

  it('FR-SCR-3: treats an unparseable date as the oldest activity instead of failing', () => {
    const [course] = groupSubmissionsByCourse([
      submission({ submitted_at: 'not-a-date', graded_at: '2026-05-05T08:00:00.000Z' }),
    ]);

    expect(course.assignments[0].latestActivityAt).toBe('2026-05-05T08:00:00.000Z');
  });
});
