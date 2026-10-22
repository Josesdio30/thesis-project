/**
 * Authorization matrix v1 — QA Sprint 1, item A-1 (docs/qa/test-plan-sprint-1.md).
 *
 * Each row calls a route handler as a fixed persona against a fixture "world"
 * in which the request would succeed for its rightful owner: class_course 70
 * (course MAT001) is taught by teacher 201; student 101 is enrolled; assignment
 * 7000 belongs to session 700 of that class_course.
 *
 * Per persona a row is one of:
 *   - allowed  → requirement test: the request succeeds (positive control,
 *                proving the fixture is enough to reach the success path)
 *   - denied, decided rule     → requirement test: 403 (fixed 2026-10-17)
 *   - denied, undecided        → characterization of today's success (DC id)
 *
 * Decided rules (docs/qa/assumptions-and-gaps.md §5a): Q-06 own courses only,
 * Q-07 assigned teacher + admin manage content/publish/grade, Q-10 AI and
 * plagiarism data for the course teacher + admin only, Q-12 identity from the
 * session and enrollment required to submit. Requests reach handlers after the
 * global middleware, so "anonymous" is only exercised where DC-01 lets it
 * through (dotted paths).
 */
import path from 'path';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/prisma';
import { courseService } from '@/lib/prisma-services';
import { queryLMS } from '@/lib/lms-db';
import { query as dbQuery } from '@/lib/database';
import { PERSONAS, sessionFor, userRecordFor, type PersonaName } from '../helpers/personas';
import { buildRequest, routeContext } from '../helpers/request';
import { resetPrismaMock, type PrismaMock } from '../helpers/prisma-mock';

import * as coursesRoute from '@/app/api/courses/route';
import * as courseRoute from '@/app/api/courses/[code]/route';
import * as syllabusRoute from '@/app/api/courses/[code]/syllabus/route';
import * as sessionsRoute from '@/app/api/courses/[code]/sessions/route';
import * as materialsRoute from '@/app/api/courses/[code]/sessions/[sessionId]/materials/route';
import * as materialRoute from '@/app/api/courses/[code]/sessions/[sessionId]/materials/[id]/route';
import * as reorderRoute from '@/app/api/courses/[code]/sessions/[sessionId]/materials/[id]/reorder/route';
import * as resourcesRoute from '@/app/api/courses/[code]/sessions/[sessionId]/resources/route';
import * as resourceRoute from '@/app/api/courses/[code]/sessions/[sessionId]/resources/[resourceId]/route';
import * as assignmentRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/route';
import * as publishRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/publish/route';
import * as editRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/edit/route';
import * as gradeRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/grade/route';
import * as submitRoute from '@/app/api/courses/[code]/sessions/[sessionId]/assignments/[assignmentId]/submit/route';
import * as filesRoute from '@/app/api/files/[...path]/route';
import * as uploadRoute from '@/app/api/upload/route';
import * as aiResultsRoute from '@/app/api/ai-grading/results/[assignmentId]/route';
import * as aiStatusRoute from '@/app/api/ai-grading/status/route';
import * as aiStatusLatestRoute from '@/app/api/ai-grading/status/latest/[assignmentId]/route';
import * as pdsResultsRoute from '@/app/api/plagiarism/results/[assignmentId]/route';
import * as pdsEvidenceRoute from '@/app/api/plagiarism/evidence/[comparisonId]/route';
import * as pdsSimilaritiesRoute from '@/app/api/plagiarism/similarities/[submissionId]/route';
import * as pdsExportRoute from '@/app/api/plagiarism/export/[assignmentId]/route';
import * as pdsStatusRoute from '@/app/api/plagiarism/status/[detectionId]/route';
import * as pdsStatusLatestRoute from '@/app/api/plagiarism/status/latest/[assignmentId]/route';
import * as featureAccessRoute from '@/app/api/courses/[code]/feature-access/route';
import * as dbTestRoute from '@/app/api/db/test/route';

// ---------------------------------------------------------------- mocks

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('@/auth', () => ({ authOptions: {} }));
jest.mock('@/lib/prisma', () => {
  const { createPrismaMock } = jest.requireActual('../helpers/prisma-mock');
  const prisma = createPrismaMock();
  return { __esModule: true, prisma, default: prisma };
});
jest.mock('@/lib/prisma-services', () => ({
  courseService: {
    findByTeacher: jest.fn(),
    findByStudent: jest.fn(),
    findAll: jest.fn(),
    findByCode: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
}));
jest.mock('@/lib/enumeration-service', () => ({
  SubmissionStatus: {
    getSubmittedId: jest.fn(async () => 11),
    getGradedId: jest.fn(async () => 12),
  },
}));
jest.mock('@/lib/lms-db', () => ({ queryLMS: jest.fn() }));
jest.mock('@/lib/db2/acs-repo', () => ({
  acsTables: jest.fn(() => ({})),
  getLatestCompletedJobByAssignment: jest.fn(),
  getGradingResultsByJobAndStudent: jest.fn(),
  getGradingJobById: jest.fn(),
  countGradingResultsByJobId: jest.fn(),
  getGradingResultsByJobId: jest.fn(),
  getLatestGradingJobByAssignment: jest.fn(),
}));
jest.mock('@/lib/db2/pds-repo', () => ({
  pdsTables: jest.fn(() => ({})),
  getComparisonsBySubmissionIds: jest.fn(),
  getComparisonsBySubmissionId: jest.fn(),
  getComparisonById: jest.fn(),
  getFlagByComparisonAndSubmission: jest.fn(),
  getDetectionStatus: jest.fn(),
  getLatestDetectionForAssignment: jest.fn(),
}));
jest.mock('@/lib/db2/admin-repo', () => ({ isScopeEnabled: jest.fn() }));
jest.mock('@/lib/database', () => ({ query: jest.fn() }));
jest.mock('@/lib/db-utils', () => ({ checkDatabaseHealth: jest.fn() }));
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn(),
  unlink: jest.fn(),
}));

const db = prisma as unknown as PrismaMock;
const mockSession = getServerSession as jest.Mock;
const courses = courseService as unknown as Record<string, jest.Mock>;
const acs = jest.requireMock('@/lib/db2/acs-repo') as Record<string, jest.Mock>;
const pds = jest.requireMock('@/lib/db2/pds-repo') as Record<string, jest.Mock>;
const adminRepo = jest.requireMock('@/lib/db2/admin-repo') as Record<string, jest.Mock>;
const dbUtils = jest.requireMock('@/lib/db-utils') as Record<string, jest.Mock>;

// ---------------------------------------------------------------- world

const NOW = new Date('2026-10-17T08:00:00.000Z');
const FUTURE = new Date('2099-01-01T00:00:00.000Z');
const PAST = new Date('2026-01-01T00:00:00.000Z');

const ESSAY = { id: 3, name: 'ESSAY', category: 'QUESTION_TYPE', is_active: true };
const MC = { id: 1, name: 'MULTIPLE CHOICE', category: 'QUESTION_TYPE', is_active: true };

const COURSE = { id: 7, course_code: 'MAT001', course_name: 'Matematika', description: 'd', created_at: NOW, updated_at: NOW };
const CLASS_COURSE = {
  id: 70, class_id: 5, course_id: 7, teacher_id: 201, start_date: PAST, end_date: FUTURE, is_active: true,
  syllabus: '<p>s</p>', courses: COURSE, classes: { id: 5, class_name: 'X-1', grade_level: '10' },
};
const QUESTIONS = [
  {
    id: 1, assignment_id: 7000, question_type_id: 1, question_text: 'Q1', points: 2, order_number: 1, required: true,
    enumeration: MC,
    assignment_question_options: [
      { id: 11, question_id: 1, option_text: 'a', is_correct: true, order_number: 1 },
      { id: 12, question_id: 1, option_text: 'b', is_correct: false, order_number: 2 },
    ],
  },
  {
    id: 2, assignment_id: 7000, question_type_id: 3, question_text: 'Q2', points: 10, order_number: 2, required: true,
    enumeration: ESSAY, assignment_question_options: [],
  },
];
const ANSWERS = [
  { id: 1, submission_id: 70000, question_id: 1, answer_text: null, selected_option_id: 11, points_earned: 2, feedback: null, assignment_questions: QUESTIONS[0], assignment_question_options: QUESTIONS[0].assignment_question_options[0] },
  { id: 2, submission_id: 70000, question_id: 2, answer_text: 'essay', selected_option_id: null, points_earned: 0, feedback: null, assignment_questions: QUESTIONS[1], assignment_question_options: null },
];
const OWN_SUBMISSION = {
  id: 70000, assignment_id: 7000, student_id: 101, attempt_number: 1, submitted_at: NOW, total_score: null, status_id: 11,
  app_user_assignment_submissions_student_idToapp_user: { id: 101, nama_lengkap: 'student user', user_name: 'student' },
  assignment_answers: ANSWERS,
};
const OTHER_SUBMISSION = {
  id: 70001, assignment_id: 7000, student_id: 102, attempt_number: 1, submitted_at: NOW, total_score: null, status_id: 11,
  app_user_assignment_submissions_student_idToapp_user: { id: 102, nama_lengkap: 'otherStudent user', user_name: 'otherStudent' },
  assignment_answers: ANSWERS,
};

/** One generic row carrying every field the routes under test read. */
function worldRow() {
  return {
    ...COURSE,
    id: 1,
    class_id: 5, course_id: 7, teacher_id: 201, start_date: PAST, end_date: FUTURE, is_active: true, syllabus: '<p>s</p>',
    class_course_id: 70, title: 'Title', session_number: 1, start_time: NOW, end_time: FUTURE, is_completed: false,
    session_id: 700, content: '<p>c</p>', material_order: 2,
    file_url: '/uploads/courses/MAT001/sessions/700/f.pdf', file_name: 'f.pdf', file_type: 'file', file_size: 10,
    content_type: 'application/pdf', uploader_id: 201, version: 1, is_public: false, download_count: 0, file_tittle: 'f',
    assignment_type_id: 1, instructions: 'i', total_points: 100, due_date: FUTURE, time_limit: null,
    attempts_allowed: 3, show_results: true, is_published: true, created_by: 201, created_date: NOW, updated_date: NOW,
    assignment_id: 7000, student_id: 101, attempt_number: 1, submitted_at: NOW, started_at: NOW, status_id: 11,
    total_score: null, feedback: null, graded_by: null, graded_at: null,
    enumeration: { id: 1, name: 'QUIZ', category: 'ASSIGNMENT_TYPE', is_active: true },
    assignment_questions: QUESTIONS,
    assignment_answers: ANSWERS,
    assignment_submissions: [OWN_SUBMISSION, OTHER_SUBMISSION],
    app_user_assignment_submissions_student_idToapp_user: { id: 101, nama_lengkap: 'student user', user_name: 'student' },
    assignments: { id: 7000, assignment_questions: QUESTIONS, sessions: { id: 700, class_courses: CLASS_COURSE } },
    sessions: { id: 700, class_course_id: 70, class_courses: CLASS_COURSE },
    class_courses: CLASS_COURSE,
    courses: COURSE,
  };
}

const MODELS = [
  'courses', 'class_courses', 'sessions', 'materials', 'resources', 'assignments', 'assignment_submissions',
  'assignment_answers', 'assignment_questions', 'assignment_question_options', 'enrollments', 'app_user', 'enumeration',
];

function seedWorld(actor: PersonaName) {
  resetPrismaMock(db);
  for (const model of MODELS) {
    db[model].findFirst.mockImplementation(async () => worldRow());
    db[model].findUnique.mockImplementation(async () => worldRow());
    db[model].findMany.mockImplementation(async () => [worldRow()]);
    for (const m of ['create', 'update', 'delete', 'upsert']) db[model][m].mockImplementation(async () => worldRow());
    for (const m of ['deleteMany', 'updateMany', 'createMany']) db[model][m].mockResolvedValue({ count: 1 });
    db[model].count.mockResolvedValue(0);
  }
  db.app_user.findUnique.mockImplementation(async () => userRecordFor(PERSONAS[actor]));

  for (const fn of ['findByTeacher', 'findByStudent', 'findAll']) courses[fn].mockResolvedValue([]);
  courses.findByCode.mockResolvedValue(COURSE);
  courses.update.mockResolvedValue(COURSE);
  courses.delete.mockResolvedValue(COURSE);

  (queryLMS as jest.Mock).mockResolvedValue([
    { submission_id: '70000', student_id: '101', student_name: 'student user', name: 'student user', content: 'text a' },
    { submission_id: '70001', student_id: '102', student_name: 'otherStudent user', name: 'otherStudent user', content: 'text b' },
  ]);
  const comparison = {
    id: 'cmp-1', source_submission_id: '70000', target_submission_id: '70001', combined_score: 0.9,
    risk_level: 'HIGH', matched_chunks: { chunks: [], per_question_scores: [] },
  };
  pds.getComparisonsBySubmissionIds.mockResolvedValue([comparison]);
  pds.getComparisonsBySubmissionId.mockResolvedValue([comparison]);
  pds.getComparisonById.mockResolvedValue(comparison);
  pds.getFlagByComparisonAndSubmission.mockResolvedValue({ id: 'flag-1', reviewed: false });
  pds.getDetectionStatus.mockResolvedValue({ id: 'det-1', assignment_id: '7000', status: 'completed' });
  pds.getLatestDetectionForAssignment.mockResolvedValue({ id: 'det-1', status: 'completed' });

  const job = { id: 'job-1', assignment_id: '7000', status: 'completed', total_students: 2, completed_at: NOW, created_at: NOW };
  const result = { question_id: '2', student_id: '101', score: 8, max_score: 10, feedback: 'ok' };
  acs.getLatestCompletedJobByAssignment.mockResolvedValue(job);
  acs.getLatestGradingJobByAssignment.mockResolvedValue(job);
  acs.getGradingJobById.mockResolvedValue(job);
  acs.countGradingResultsByJobId.mockResolvedValue(1);
  acs.getGradingResultsByJobId.mockResolvedValue([result]);
  acs.getGradingResultsByJobAndStudent.mockResolvedValue([result]);
  adminRepo.isScopeEnabled.mockResolvedValue(true);

  (dbQuery as jest.Mock).mockResolvedValue({
    rows: [{ current_time: NOW, current_database: 'lms', current_user: 'u', version: 'PostgreSQL 16.1 x', table_name: 'app_user', table_type: 'BASE TABLE', database_size: '10 MB' }],
  });
  dbUtils.checkDatabaseHealth.mockResolvedValue({ connected: true });
  (readFile as jest.Mock).mockResolvedValue(Buffer.from('%PDF-1.4'));
  (writeFile as jest.Mock).mockResolvedValue(undefined);
  (mkdir as jest.Mock).mockResolvedValue(undefined);

  mockSession.mockResolvedValue(sessionFor(PERSONAS[actor]));
}

// ---------------------------------------------------------------- rows

const COURSE_URL = '/api/courses/MAT001';
const SESSION_URL = `${COURSE_URL}/sessions/700`;
const ASSIGNMENT_URL = `${SESSION_URL}/assignments/7000`;
const ASSIGNMENT_PARAMS = { code: 'MAT001', sessionId: '700', assignmentId: '7000' };

type Call = () => Promise<Response>;

interface Row {
  name: string;
  requirement: string;
  dc: string;
  call: Call;
  allowed: PersonaName[];
  denied: PersonaName[];
  /** true when the denial is a PO decision (enforced); false = characterization only. */
  decided: boolean;
}

const OWNERS: PersonaName[] = ['teacherOwner', 'guruOwner', 'admin'];
const OUTSIDERS: PersonaName[] = ['student', 'teacherOther'];

function fileForm(fields: Record<string, string>) {
  const form = new FormData();
  form.set('file', new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

const ROWS: Row[] = [
  // ---- Q-07: course content, publish, edit, grade
  {
    name: 'PUT /api/courses/{code}', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => courseRoute.PUT(buildRequest(COURSE_URL, { method: 'PUT', json: { course_name: 'New', updated_by: 201 } }), routeContext({ code: 'MAT001' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'DELETE /api/courses/{code}', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => courseRoute.DELETE(buildRequest(COURSE_URL, { method: 'DELETE' }), routeContext({ code: 'MAT001' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'PUT /api/courses/{code}/syllabus', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => syllabusRoute.PUT(buildRequest(`${COURSE_URL}/syllabus`, { method: 'PUT', json: { syllabus: '<p>x</p>', updated_by: 201 } }), routeContext({ code: 'MAT001' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'POST /api/courses/{code}/sessions (create resource)', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => sessionsRoute.POST(buildRequest(`${COURSE_URL}/sessions`, { method: 'POST', json: { sessionId: '700', file_url: '/x', file_name: 'x', file_type: 'link', uploader_id: 201 } }), routeContext({ code: 'MAT001' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'POST .../materials', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => materialsRoute.POST(buildRequest(`${SESSION_URL}/materials`, { method: 'POST', json: { title: 'M', content: '<p>c</p>' } }), routeContext({ code: 'MAT001', sessionId: '700' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'PUT .../materials/{id}', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => materialRoute.PUT(buildRequest(`${SESSION_URL}/materials/1`, { method: 'PUT', json: { title: 'M2', content: '<p>c</p>' } }), routeContext({ code: 'MAT001', sessionId: '700', id: '1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'DELETE .../materials/{id}', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => materialRoute.DELETE(buildRequest(`${SESSION_URL}/materials/1`, { method: 'DELETE' }), routeContext({ code: 'MAT001', sessionId: '700', id: '1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'PATCH .../materials/{id}/reorder', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => reorderRoute.PATCH(buildRequest(`${SESSION_URL}/materials/1/reorder`, { method: 'PATCH', json: { direction: 'up' } }), routeContext({ code: 'MAT001', sessionId: '700', id: '1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'POST .../resources', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => resourcesRoute.POST(buildRequest(`${SESSION_URL}/resources`, { method: 'POST', json: { file_url: '/x.pdf', file_name: 'x.pdf', file_type: 'file' } }), routeContext({ code: 'MAT001', sessionId: '700' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'DELETE .../resources/{resourceId}', requirement: 'FR-CRS-5', dc: 'DC-04', decided: true,
    call: () => resourceRoute.DELETE(buildRequest(`${SESSION_URL}/resources/1`, { method: 'DELETE' }), routeContext({ code: 'MAT001', sessionId: '700', resourceId: '1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'PUT .../assignments/{id}/publish', requirement: 'FR-ASG-6', dc: 'DC-04', decided: true,
    call: () => publishRoute.PUT(buildRequest(`${ASSIGNMENT_URL}/publish`, { method: 'PUT', json: { is_published: false } }), routeContext(ASSIGNMENT_PARAMS)),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    // Already checks `created_by`: outsiders get 403, but so does an admin,
    // which Q-07 allows.
    name: 'PUT .../assignments/{id}/edit', requirement: 'FR-ASG-6', dc: 'DC-04', decided: true,
    call: () => editRoute.PUT(buildRequest(`${ASSIGNMENT_URL}/edit`, { method: 'PUT', json: { title: 'T2', is_published: true } }), routeContext(ASSIGNMENT_PARAMS)),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET .../assignments/{id}/grade (ungraded list)', requirement: 'FR-GRD-3', dc: 'DC-04', decided: true,
    call: () => gradeRoute.GET(buildRequest(`${ASSIGNMENT_URL}/grade`), routeContext(ASSIGNMENT_PARAMS)),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'POST .../assignments/{id}/grade', requirement: 'FR-GRD-3', dc: 'DC-04', decided: true,
    call: () => gradeRoute.POST(buildRequest(`${ASSIGNMENT_URL}/grade`, { method: 'POST', json: { submission_id: 70000, grader_id: 201, grades: [{ question_id: 2, points_earned: 5, feedback: 'ok' }], feedback: 'good' } }), routeContext(ASSIGNMENT_PARAMS)),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  // ---- Q-10: AI grading and plagiarism data
  {
    name: 'GET /api/ai-grading/results/{assignmentId}', requirement: 'FR-ACS-13', dc: 'DC-07', decided: true,
    call: () => aiResultsRoute.GET(buildRequest('/api/ai-grading/results/7000', { query: { studentId: '102' } }), routeContext({ assignmentId: '7000' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/ai-grading/status?jobId=', requirement: 'FR-ACS-13', dc: 'DC-07', decided: true,
    call: () => aiStatusRoute.GET(buildRequest('/api/ai-grading/status', { query: { jobId: 'job-1' } })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/ai-grading/status/latest/{assignmentId}', requirement: 'FR-ACS-13', dc: 'DC-07', decided: true,
    call: () => aiStatusLatestRoute.GET(buildRequest('/api/ai-grading/status/latest/7000'), routeContext({ assignmentId: '7000' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/results/{assignmentId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsResultsRoute.GET(buildRequest('/api/plagiarism/results/7000'), routeContext({ assignmentId: '7000' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/evidence/{comparisonId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsEvidenceRoute.GET(buildRequest('/api/plagiarism/evidence/cmp-1', { query: { submissionId: '70000' } }), routeContext({ comparisonId: 'cmp-1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/similarities/{submissionId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsSimilaritiesRoute.GET(buildRequest('/api/plagiarism/similarities/70001'), routeContext({ submissionId: '70001' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/export/{assignmentId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsExportRoute.GET(buildRequest('/api/plagiarism/export/7000'), routeContext({ assignmentId: '7000' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/status/{detectionId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsStatusRoute.GET(buildRequest('/api/plagiarism/status/det-1'), routeContext({ detectionId: 'det-1' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  {
    name: 'GET /api/plagiarism/status/latest/{assignmentId}', requirement: 'FR-PDS-10', dc: 'DC-08', decided: true,
    call: () => pdsStatusLatestRoute.GET(buildRequest('/api/plagiarism/status/latest/7000'), routeContext({ assignmentId: '7000' })),
    allowed: OWNERS, denied: OUTSIDERS,
  },
  // ---- undecided: characterization only
  {
    name: 'GET .../assignments/{id} (detail)', requirement: 'FR-ASG-5', dc: 'DC-09', decided: true,
    call: () => assignmentRoute.GET(buildRequest(ASSIGNMENT_URL), routeContext(ASSIGNMENT_PARAMS)),
    allowed: [...OWNERS, 'student'], denied: ['teacherOther'],
  },
  {
    name: 'GET /api/courses/{code}/feature-access', requirement: 'FR-AIM-4', dc: '—', decided: false,
    call: () => featureAccessRoute.GET(buildRequest(`${COURSE_URL}/feature-access`), routeContext({ code: 'MAT001' })),
    allowed: [...OWNERS, 'student'], denied: [],
  },
  {
    name: 'GET /api/db/test', requirement: 'O-37', dc: 'DC-12', decided: false,
    call: () => dbTestRoute.GET(),
    allowed: ['admin'], denied: OUTSIDERS,
  },
];

// ---------------------------------------------------------------- runner

async function statusAs(persona: PersonaName, call: Call) {
  seedWorld(persona);
  const res = await call();
  return res.status;
}

beforeEach(() => {
  for (const level of ['log', 'warn', 'error'] as const) jest.spyOn(console, level).mockImplementation(() => {});
});

describe.each(ROWS)('A-1 $name', row => {
  for (const persona of row.allowed) {
    test(`${row.requirement}: ${persona} succeeds (positive control)`, async () => {
      expect(await statusAs(persona, row.call)).toBeLessThan(300);
    });
  }

  for (const persona of row.denied) {
    if (row.decided) {
      test(`${row.requirement} [${row.dc}]: ${persona} → 403`, async () => {
        expect(await statusAs(persona, row.call)).toBe(403);
      });
    } else {
      // RISK: see the DC id in docs/qa/defect-candidates.md
      test(`characterization ${row.dc}: ${persona} succeeds today`, async () => {
        expect(await statusAs(persona, row.call)).toBeLessThan(300);
      });
    }
  }
});

// ---------------------------------------------------------------- identity & data probes

describe('Q-06 own courses only: GET /api/courses', () => {
  test('FR-CRS-2 [DC-03]: a student\'s query is scoped to the session user', async () => {
    seedWorld('student');
    await coursesRoute.GET(buildRequest('/api/courses', { query: { studentId: '102' } }));
    expect(courses.findByStudent).toHaveBeenCalledWith(101);
  });

  test('FR-CRS-2 [DC-03]: a teacher\'s query is scoped to the session user', async () => {
    seedWorld('teacherOther');
    await coursesRoute.GET(buildRequest('/api/courses', { query: { teacherId: '201' } }));
    expect(courses.findByTeacher).toHaveBeenCalledWith(202);
  });

  test('FR-CRS-2: an admin may query any user\'s courses', async () => {
    seedWorld('admin');
    const res = await coursesRoute.GET(buildRequest('/api/courses', { query: { studentId: '102' } }));
    expect(res.status).toBe(200);
    expect(courses.findByStudent).toHaveBeenCalledWith(102);
  });
});

describe('Q-12 identity from the session: submit', () => {
  const submitAs = (studentId: number) =>
    submitRoute.POST(
      buildRequest(`${ASSIGNMENT_URL}/submit`, {
        method: 'POST',
        json: { student_id: studentId, answers: [{ question_id: 1, selected_option_id: 11 }, { question_id: 2, answer_text: 'essay' }] },
      }),
      routeContext(ASSIGNMENT_PARAMS)
    );

  test('FR-SUB-1: an enrolled student submitting as themself succeeds (positive control)', async () => {
    seedWorld('student');
    expect((await submitAs(101)).status).toBe(200);
  });

  test('FR-SUB-2 [DC-05]: the submission is recorded for the session student', async () => {
    seedWorld('student');
    await submitAs(102);
    expect(db.assignment_submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ student_id: 101 }) })
    );
  });

  test('FR-SUB-2 [DC-05]: a student not enrolled in the class-course → 403', async () => {
    seedWorld('student');
    db.enrollments.findFirst.mockResolvedValue(null);
    db.enrollments.findUnique.mockResolvedValue(null);
    db.enrollments.findMany.mockResolvedValue([]);
    db.enrollments.count.mockResolvedValue(0);
    expect((await submitAs(101)).status).toBe(403);
  });
});

describe('Q-12 identity from the session: legacy POST .../assignments/{id} (unused duplicate of submit)', () => {
  const legacySubmit = (studentId: number) =>
    assignmentRoute.POST(
      buildRequest(ASSIGNMENT_URL, { method: 'POST', json: { student_id: studentId, answers: [{ question_id: 2, answer_text: 'essay' }] } }),
      routeContext(ASSIGNMENT_PARAMS)
    );

  test('FR-SUB-2: the submission is recorded for the session student, not the body student_id', async () => {
    seedWorld('student');
    expect((await legacySubmit(102)).status).toBe(200);
    expect(db.assignment_submissions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ student_id: 101 }) })
    );
  });

  test('FR-SUB-2: a student not enrolled in the class-course → 403', async () => {
    seedWorld('student');
    db.enrollments.findFirst.mockResolvedValue(null);
    expect((await legacySubmit(101)).status).toBe(403);
  });

  test('no session → 401', async () => {
    seedWorld('anonymous');
    expect((await legacySubmit(101)).status).toBe(401);
  });
});

describe('Q-12 identity from the session: grade', () => {
  const gradeWithGrader = (graderId: number) =>
    gradeRoute.POST(
      buildRequest(`${ASSIGNMENT_URL}/grade`, {
        method: 'POST',
        json: { submission_id: 70000, grader_id: graderId, grades: [{ question_id: 2, points_earned: 5, feedback: 'ok' }], feedback: 'f' },
      }),
      routeContext(ASSIGNMENT_PARAMS)
    );

  test('FR-GRD-3 [DC-06]: graded_by is the session teacher', async () => {
    seedWorld('teacherOwner');
    await gradeWithGrader(999);
    expect(db.assignment_submissions.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ graded_by: 201 }) })
    );
  });
});

const FILE_PATH = ['courses', 'MAT001', 'sessions', '700', 'f.pdf'];
const getFile = (segments: string[] = FILE_PATH) =>
  filesRoute.GET(buildRequest(`/api/files/${segments.join('/')}`), routeContext({ path: segments }));
// A6: the upload route checks the file's leading bytes, so each fixture starts with real ones.
const MAGIC: Record<string, number[]> = {
  pdf: [...Buffer.from('%PDF-1.4')],
  doc: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  docx: [0x50, 0x4b, 0x03, 0x04],
  jpg: [0xff, 0xd8, 0xff, 0xe0],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  gif: [...Buffer.from('GIF89a')],
};
const bytesFor = (fileName: string) =>
  new Uint8Array(MAGIC[fileName.split('.').pop()!.toLowerCase()] ?? [...Buffer.from('<html></html>')]);
const upload = (
  fields: Record<string, string>,
  fileName = 'notes.pdf',
  type = 'application/pdf',
  content: BlobPart = bytesFor(fileName)
) => {
  const form = new FormData();
  form.set('file', new File([content], fileName, { type }));
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return uploadRoute.POST(buildRequest('/api/upload', { method: 'POST', form }));
};
const notEnrolled = () => {
  db.enrollments.findFirst.mockResolvedValue(null);
};

describe('FR-ASG-5: assignment detail shows students only their own work', () => {
  test('FR-ASG-5 [DC-09]: a student gets no answer keys and only their own submission', async () => {
    seedWorld('student');
    const res = await assignmentRoute.GET(buildRequest(ASSIGNMENT_URL), routeContext(ASSIGNMENT_PARAMS));
    const body = await res.json();

    expect(res.status).toBe(200);
    for (const question of body.data.questions) {
      for (const option of question.options) expect(option).not.toHaveProperty('is_correct');
    }
    expect(body.data.submissions.map((sub: { student: { id: number } }) => sub.student.id)).toEqual([101]);
  });

  test('FR-ASG-5: the course teacher sees the answer keys and every submission', async () => {
    seedWorld('teacherOwner');
    const res = await assignmentRoute.GET(buildRequest(ASSIGNMENT_URL), routeContext(ASSIGNMENT_PARAMS));
    const body = await res.json();

    expect(body.data.questions[0].options.some((o: { is_correct: boolean }) => o.is_correct)).toBe(true);
    expect(body.data.submissions.map((sub: { student: { id: number } }) => sub.student.id)).toEqual([101, 102]);
  });

  test('FR-ASG-5: a student not enrolled in the course → 403', async () => {
    seedWorld('student');
    notEnrolled();
    const res = await assignmentRoute.GET(buildRequest(ASSIGNMENT_URL), routeContext(ASSIGNMENT_PARAMS));
    expect(res.status).toBe(403);
  });
});

describe('FR-FILE-4 / Q-09: course files are private to course members', () => {
  test('FR-FILE-4 [DC-10]: no session → 401 and nothing is read', async () => {
    seedWorld('anonymous');
    expect((await getFile()).status).toBe(401);
    expect(readFile).not.toHaveBeenCalled();
  });

  test.each(['student', 'teacherOwner', 'guruOwner', 'admin'] as const)('FR-FILE-4: course member %s can open the file', async persona => {
    seedWorld(persona);
    const res = await getFile();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
  });

  test('FR-FILE-4 [DC-10]: a teacher of another class → 403', async () => {
    seedWorld('teacherOther');
    expect((await getFile()).status).toBe(403);
  });

  test('FR-FILE-4 [DC-10]: a student not enrolled in the class → 403', async () => {
    seedWorld('student');
    notEnrolled();
    expect((await getFile()).status).toBe(403);
  });

  test.each([
    ['a non-course path', ['uploads', 'other.pdf']],
    ['a ".." escape', ['courses', 'MAT001', 'sessions', '700', '..', '..', '..', '..', '..', '.env']],
    ['a non-numeric session', ['courses', 'MAT001', 'sessions', 'x', 'f.pdf']],
    ['a hop from a member session into another course', ['courses', 'MAT001', 'sessions', '700', '..', '..', '..', 'BIO001', 'sessions', '800', 'secret.pdf']],
  ])('FR-FILE-4: %s → 404 and nothing is read', async (_label, segments) => {
    seedWorld('admin');
    expect((await getFile(segments as string[])).status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  test('FR-FILE-4: a session that belongs to a different course code → 404', async () => {
    seedWorld('admin');
    expect((await getFile(['courses', 'BIO001', 'sessions', '700', 'f.pdf'])).status).toBe(404);
  });
});

describe('FR-FILE-1..4 / Q-08: uploads', () => {
  const FIELDS = { courseCode: 'MAT001', sessionId: '700' };

  test('FR-FILE-4 [DC-10]: no session → 401', async () => {
    seedWorld('anonymous');
    expect((await upload(FIELDS)).status).toBe(401);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test.each(['student', 'teacherOwner', 'admin'] as const)('FR-FILE-4: course member %s can upload (forum attachments, resources)', async persona => {
    seedWorld(persona);
    expect((await upload(FIELDS)).status).toBe(200);
    const dir = (mkdir as jest.Mock).mock.calls[0][0] as string;
    expect(dir).toBe(path.join(process.cwd(), 'public', 'uploads', 'courses', 'MAT001', 'sessions', '700'));
  });

  test('FR-FILE-4 [DC-10]: a teacher of another class → 403', async () => {
    seedWorld('teacherOther');
    expect((await upload(FIELDS)).status).toBe(403);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test.each([
    ['notes.html', 'text/html'],
    ['run.exe', 'application/octet-stream'],
    ['drawing.svg', 'image/svg+xml'],
    ['slides.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['README', 'text/plain'],
  ])('FR-FILE-2: %s is rejected with 415', async (name, type) => {
    seedWorld('teacherOwner');
    expect((await upload(FIELDS, name, type)).status).toBe(415);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test.each([
    ['notes.pdf', 'application/pdf'],
    ['essay.doc', 'application/msword'],
    ['essay.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['photo.JPG', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['chart.png', 'image/png'],
    ['anim.gif', 'image/gif'],
  ])('FR-FILE-2: %s is accepted', async (name, type) => {
    seedWorld('teacherOwner');
    expect((await upload(FIELDS, name, type)).status).toBe(200);
  });

  // A6 / Q-08: the extension alone is not trusted; the content must match it.
  test.each([
    ['HTML renamed to .pdf', 'notes.pdf', 'application/pdf', '<html><script>alert(1)</script></html>'],
    ['a PDF renamed to .png', 'chart.png', 'image/png', '%PDF-1.4'],
    ['a Windows executable renamed to .docx', 'essay.docx', '', 'MZ\x90\x00'],
    ['an empty .jpg', 'photo.jpg', 'image/jpeg', ''],
  ])('FR-FILE-2 [A6]: %s is rejected with 415 and nothing is written', async (_label, name, type, content) => {
    seedWorld('teacherOwner');
    expect((await upload(FIELDS, name, type, content)).status).toBe(415);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('FR-FILE-2 [A6]: a declared MIME type that contradicts the extension => 415', async () => {
    seedWorld('teacherOwner');
    expect((await upload(FIELDS, 'notes.pdf', 'text/html')).status).toBe(415);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test.each(['', 'application/octet-stream'])(
    'FR-FILE-2 [A6]: a generic declared type (%p) falls back to the content check',
    async type => {
      seedWorld('teacherOwner');
      expect((await upload(FIELDS, 'essay.doc', type)).status).toBe(200);
    }
  );

  test('FR-FILE-1 [A6]: a file over 10 MB => 413 and nothing is written', async () => {
    seedWorld('teacherOwner');
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(MAGIC.pdf);
    const res = await upload(FIELDS, 'big.pdf', 'application/pdf', big);
    expect(res.status).toBe(413);
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('FR-FILE-1: a file of exactly 10 MB is accepted', async () => {
    seedWorld('teacherOwner');
    const max = new Uint8Array(10 * 1024 * 1024);
    max.set(MAGIC.pdf);
    expect((await upload(FIELDS, 'max.pdf', 'application/pdf', max)).status).toBe(200);
  });

  test('FR-FILE-1: a request without a file => 400', async () => {
    seedWorld('teacherOwner');
    const form = new FormData();
    for (const [k, v] of Object.entries(FIELDS)) form.set(k, v);
    const res = await uploadRoute.POST(buildRequest('/api/upload', { method: 'POST', form }));
    expect(res.status).toBe(400);
  });

  test('a directory that cannot be created => 500 and nothing is written', async () => {
    seedWorld('teacherOwner');
    (mkdir as jest.Mock).mockRejectedValueOnce(new Error('EACCES'));
    const res = await upload(FIELDS);
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to create upload directory');
    expect(writeFile).not.toHaveBeenCalled();
  });

  test('NFR [A7]: a write failure => 500 without internal error details', async () => {
    seedWorld('teacherOwner');
    (writeFile as jest.Mock).mockRejectedValueOnce(new Error("EACCES: permission denied, open '/srv/app/public/x'"));
    const res = await upload(FIELDS);
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json).not.toHaveProperty('details');
  });

  test.each([
    ['context with ".."', { ...FIELDS, context: '../../../../../../escaped' }],
    ['courseCode with ".."', { courseCode: '../..', sessionId: '700' }],
    ['non-numeric sessionId', { courseCode: 'MAT001', sessionId: '7/../../x' }],
    ['missing courseCode', { sessionId: '700' }],
    ['missing sessionId', { courseCode: 'MAT001' }],
  ])('FR-FILE-3 [DC-10]: %s → 400 and no directory is created', async (_label, fields) => {
    seedWorld('admin');
    expect((await upload(fields as Record<string, string>)).status).toBe(400);
    expect(mkdir).not.toHaveBeenCalled();
  });

  test('FR-FILE-3: a plain context folder (e.g. forum) is allowed', async () => {
    seedWorld('student');
    expect((await upload({ ...FIELDS, context: 'forum' })).status).toBe(200);
    const dir = (mkdir as jest.Mock).mock.calls[0][0] as string;
    expect(dir).toBe(path.join(process.cwd(), 'public', 'uploads', 'courses', 'MAT001', 'sessions', '700', 'forum'));
  });

  test('FR-FILE-4: a session that belongs to a different course code → 404', async () => {
    seedWorld('admin');
    expect((await upload({ courseCode: 'BIO001', sessionId: '700' })).status).toBe(404);
  });
});
