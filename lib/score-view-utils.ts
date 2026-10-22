export interface ScoreSubmission {
  id: number;
  assignment_id: number;
  assignment_title: string;
  assignment_description?: string;
  assignment_total_points: number;
  assignment_due_date?: string;
  assignment_type: string;
  course_code: string;
  course_name: string;
  class_id?: number | null;
  class_name: string;
  session_id?: number | null;
  session_title: string;
  session_number: number;
  student?: {
    id: number;
    nama_lengkap: string;
    user_name: string;
  };
  attempt_number: number;
  started_at?: string;
  submitted_at?: string;
  total_score?: number | null;
  status: string;
  status_id: number;
  feedback?: string;
  graded_by?: number;
  graded_at?: string;
}

export interface CourseAssignmentScore {
  assignment_id: number;
  assignment_title: string;
  assignment_type: string;
  assignment_total_points: number;
  latestActivityAt?: string;
  submissions: ScoreSubmission[];
  totalSubmissions: number;
  gradedSubmissions: number;
  averageScore: number;
  averagePercentage: number;
}

export interface CourseScore {
  course_code: string;
  course_name: string;
  class_name: string;
  submissions: ScoreSubmission[];
  assignments: CourseAssignmentScore[];
  totalSubmissions: number;
  gradedSubmissions: number;
  averageScore: number;
  totalPossiblePoints: number;
  earnedPoints: number;
}

const getTime = (dateString?: string) => {
  if (!dateString) return Number.NEGATIVE_INFINITY;

  const time = Date.parse(dateString);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

const getLatestActivityAt = (submission: ScoreSubmission) =>
  [
    submission.submitted_at,
    submission.graded_at,
    submission.started_at,
    submission.assignment_due_date,
  ].reduce<string | undefined>((latest, current) => {
    return getTime(current) > getTime(latest) ? current : latest;
  }, undefined);

export const groupSubmissionsByCourse = (submissions: ScoreSubmission[]): CourseScore[] => {
  const courseGroups = new Map<string, CourseScore>();

  submissions.forEach(submission => {
    const score = submission.total_score;
    const activityAt = getLatestActivityAt(submission);
    const courseKey = `${submission.course_code}-${submission.class_name}`;
    let course = courseGroups.get(courseKey);

    if (!course) {
      course = {
        course_code: submission.course_code,
        course_name: submission.course_name,
        class_name: submission.class_name,
        submissions: [],
        assignments: [],
        totalSubmissions: 0,
        gradedSubmissions: 0,
        averageScore: 0,
        totalPossiblePoints: 0,
        earnedPoints: 0,
      };
      courseGroups.set(courseKey, course);
    }

    course.submissions.push(submission);
    course.totalSubmissions++;
    course.totalPossiblePoints += submission.assignment_total_points;

    if (score !== null && score !== undefined) {
      course.gradedSubmissions++;
      course.earnedPoints += score;
    }

    let assignment = course.assignments.find(
      assignmentScore => assignmentScore.assignment_id === submission.assignment_id
    );

    if (!assignment) {
      assignment = {
        assignment_id: submission.assignment_id,
        assignment_title: submission.assignment_title,
        assignment_type: submission.assignment_type,
        assignment_total_points: submission.assignment_total_points,
        latestActivityAt: activityAt,
        submissions: [],
        totalSubmissions: 0,
        gradedSubmissions: 0,
        averageScore: 0,
        averagePercentage: 0,
      };
      course.assignments.push(assignment);
    }

    assignment.submissions.push(submission);
    assignment.totalSubmissions++;

    if (getTime(activityAt) > getTime(assignment.latestActivityAt)) {
      assignment.latestActivityAt = activityAt;
    }

    if (score !== null && score !== undefined) {
      assignment.gradedSubmissions++;
      assignment.averageScore += score;
    }
  });

  courseGroups.forEach(course => {
    course.averageScore =
      course.gradedSubmissions > 0 ? course.earnedPoints / course.gradedSubmissions : 0;

    course.assignments.forEach(assignment => {
      assignment.averageScore =
        assignment.gradedSubmissions > 0
          ? assignment.averageScore / assignment.gradedSubmissions
          : 0;
      assignment.averagePercentage =
        assignment.gradedSubmissions > 0 && assignment.assignment_total_points > 0
          ? (assignment.averageScore / assignment.assignment_total_points) * 100
          : 0;
    });

    course.assignments.sort((a, b) => {
      const activitySort = getTime(b.latestActivityAt) - getTime(a.latestActivityAt);
      return activitySort || a.assignment_title.localeCompare(b.assignment_title);
    });
  });

  return Array.from(courseGroups.values());
};
