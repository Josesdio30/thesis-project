#!/usr/bin/env node
/**
 * METHOD 1 — Endpoint-driven ingestion for the Automated Grading validation test.
 *
 * Drives the real LMS HTTP endpoints (no raw SQL) to stand up an isolated teacher +
 * 3 courses + 15 graded student answers per subject, then configures AI grading.
 * Reads docs/validation/automated-grading/dataset.json (built by build-dataset.py).
 *
 * Prerequisites:
 *   - Dev server running (npm run dev) at BASE_URL.
 *   - An existing ADMIN account; export ADMIN_USER / ADMIN_PASS.
 *   - At least one academic_years row already seeded.
 *   - OpenAI key configured (only needed for the AI-setup step, which builds a vector store).
 *
 * Usage:
 *   node scripts/validation/ingest.mjs --dry-run        # print planned calls, no writes
 *   ADMIN_USER=admin ADMIN_PASS=secret node scripts/validation/ingest.mjs
 *   ... --only=geografi          # one subject
 *   ... --skip-ai                # skip the AI vector-store setup step
 *
 * The script ingests only the answers tagged set=calib or set=final (15/subject).
 * The set=pool answers are reserved for the later plagiarism phase.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDatasetDigest, requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATASET = path.join(ROOT, 'docs/validation/automated-grading/dataset.json');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const TEACHER_PASS = requiredEnv('VAL_TEACHER_PASS');
const STUDENT_PASS = requiredEnv('VAL_STUDENT_PASS');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const SKIP_AI = args.includes('--skip-ai');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

// ── tiny cookie jar ──────────────────────────────────────────────────────────
const jar = new Map();
function setCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    jar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function api(method, p, body, { form = false } = {}) {
  const url = p.startsWith('http') ? p : BASE_URL + p;
  if (DRY) {
    if (method !== 'GET') console.log(`  [dry] ${method} ${p} ${body ? JSON.stringify(body).slice(0, 120) : ''}`);
    return { __dry: true, ok: true, status: 200, json: {} };
  }
  const headers = { cookie: cookieHeader() };
  let payload;
  if (body && form) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body).toString();
  } else if (body) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload, redirect: 'manual' });
  setCookies(res);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { __raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

// ── NextAuth credentials login ────────────────────────────────────────────────
async function login() {
  if (DRY) { console.log('  [dry] login as admin'); return; }
  const csrf = await api('GET', '/api/auth/csrf');
  const csrfToken = csrf.json?.csrfToken;
  if (!csrfToken) throw new Error('Could not obtain CSRF token — is the server running?');
  const res = await api('POST', '/api/auth/callback/credentials?', {
    csrfToken, username: ADMIN_USER, password: ADMIN_PASS, json: 'true',
  }, { form: true });
  if (!jar.has('next-auth.session-token') && !jar.has('__Secure-next-auth.session-token')) {
    throw new Error(`Admin login failed (status ${res.status}). Check ADMIN_USER/ADMIN_PASS.`);
  }
  console.log('  ✓ logged in as admin');
}

function unwrap(r, label) {
  if (DRY) return {};
  if (!r || (!r.ok && r.status !== 200)) {
    throw new Error(`${label} failed (status ${r?.status}): ${JSON.stringify(r?.json)}`);
  }
  return r.json;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  assertDatasetDigest('automated-grading', path.join(ROOT, 'docs/validation/automated-grading/dataset.json'));
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  await login();

  // lookups. NOTE: /api/admin/roles queries category='ROLE' but the enum uses 'USER_ROLE',
  // so it returns empty — fall back to the stable ids (STUDENT=1, TEACHER=2, ADMIN=3).
  const ROLE_FALLBACK = { student: '1', teacher: '2', admin: '3' };
  const roles = unwrap(await api('GET', '/api/admin/roles'), 'roles');
  const roleList = roles?.data?.roles || roles?.roles || roles?.data || [];
  const roleId = name => {
    const found = roleList.find(r => (r.name || '').toLowerCase() === name)?.id;
    return String(found ?? ROLE_FALLBACK[name] ?? '');
  };
  const qtypes = unwrap(await api('GET', '/api/question-types'), 'question-types');
  const qList = Array.isArray(qtypes) ? qtypes : qtypes?.data || [];
  const essay = qList.find(q => /essay/i.test(q.name) || /essay/i.test(q.alt_name || ''));
  const atypes = unwrap(await api('GET', '/api/assignment-types'), 'assignment-types');
  const aList = Array.isArray(atypes) ? atypes : atypes?.data || [];
  const aType = aList.find(a => /essay/i.test(a.name || '')) || aList[0];
  const years = unwrap(await api('GET', '/api/admin/academic-years'), 'academic-years');
  const yearList = years?.data?.academic_years || years?.academic_years || [];
  const year = yearList.find(y => y.is_active) || yearList[0];
  if (!DRY && !year) throw new Error('No academic_years found — seed one first.');
  if (!DRY) console.log(`  using year=${year?.year_name} essayType=${essay?.id} assignType=${aType?.id} teacherRole=${roleId('teacher')} studentRole=${roleId('student')}`);

  // shared teacher (created once)
  const teacherBody = {
    nama_lengkap: 'Guru Validasi AI', email: 'val_teacher@validation.local',
    user_name: 'val_teacher', password: TEACHER_PASS, role: roleId('teacher'),
    tanggal_lahir: '1990-01-01', kode_guru: 'VAL-GURU-01', niy: 'VAL0001',
  };
  const tRes = await api('POST', '/api/admin/users', teacherBody);
  let teacherId = tRes?.json?.data?.id;
  if (!DRY && !teacherId) {
    // already exists → look it up
    const users = unwrap(await api('GET', '/api/admin/users'), 'users');
    teacherId = (users?.data?.users || []).find(u => u.user_name === 'val_teacher')?.id;
  }
  console.log(`  teacher id=${teacherId}`);

  const subjects = ONLY ? [ONLY] : Object.keys(dataset.subjects);
  const summary = [];

  for (const subj of subjects) {
    const s = dataset.subjects[subj];
    console.log(`\n=== ${subj} (${s.course_code}) ===`);

    // class
    const clsRes = await api('POST', '/api/admin/classes', {
      class_name: s.class_name, grade_level: s.grade_level, year_id: String(year?.id ?? 1),
    });
    let classId = clsRes?.json?.class?.id;
    if (!DRY && !classId) {
      const cls = unwrap(await api('GET', '/api/admin/classes'), 'classes');
      classId = (cls?.data?.classes || []).find(c => c.name === s.class_name)?.id;
    }

    // course
    const crsRes = await api('POST', '/api/admin/courses', {
      course_code: s.course_code, course_name: s.course_name,
      description: `Dataset validasi automated grading — ${subj}`,
    });
    let courseId = crsRes?.json?.course?.id;
    if (!DRY && !courseId) {
      const crs = unwrap(await api('GET', '/api/admin/courses'), 'courses');
      courseId = (crs?.data?.courses || []).find(c => c.course_code === s.course_code)?.id;
    }

    // enable ai_grading for this course (endpoint is PUT, not POST)
    const acRes = await api('PUT', '/api/admin/access-control', {
      course_id: String(courseId), feature: 'ai_grading', enabled: true,
    });
    if (!DRY && !acRes?.json?.success) {
      throw new Error(`enable ai_grading failed for course ${courseId}: ${JSON.stringify(acRes?.json)}`);
    }

    // session (creates class_course linking teacher + auto-enroll)
    const sesRes = await api('POST', '/api/admin/session', {
      title: `Sesi Validasi ${subj}`, description: 'Sesi tunggal untuk uji grading',
      startTime: '08:00', endTime: '09:30', date: '2026-01-06',
      courseCode: s.course_code, teacherId: String(teacherId),
      classId: String(classId), sessionNumber: '1',
    });
    const sessionId = sesRes?.json?.data?.id;

    // students (only calib+final = 15) with class_id => auto-enroll into the class_course
    const used = s.answers.filter(a => a.set === 'calib' || a.set === 'final');
    const studentIds = {};
    for (const a of used) {
      const uname = a.student_code.toLowerCase();
      const r = await api('POST', '/api/admin/users', {
        nama_lengkap: `Siswa ${a.student_code}`, email: `${uname}@validation.local`,
        user_name: uname, password: STUDENT_PASS, role: roleId('student'),
        tanggal_lahir: '2009-01-01', nis: a.student_code, nisn: '', parent_contact: '',
        class_id: String(classId),
      });
      studentIds[a.student_code] = r?.json?.data?.id;
    }
    if (!DRY) {
      const users = unwrap(await api('GET', '/api/admin/users'), 'users');
      for (const a of used) {
        if (!studentIds[a.student_code]) {
          studentIds[a.student_code] = (users.data.users || []).find(u => u.user_name === a.student_code.toLowerCase())?.id;
        }
      }
    }

    // grounding resource (file already on disk under public/)
    const resRes = await api('POST', `/api/courses/${s.course_code}/sessions`, {
      sessionId: String(sessionId), file_url: s.grounding_file,
      file_name: path.basename(s.grounding_file), file_type: 'txt',
      file_size: 0, content_type: 'text/plain', uploader_id: teacherId,
    });
    const resourceId = resRes?.json?.data?.id;

    // assignment + 1 essay question (points = native max)
    const asgRes = await api('POST', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments`, {
      assignment_type_id: String(aType?.id ?? 1), title: `Tugas Validasi ${subj}`,
      description: s.question_text, instructions: s.question_text,
      total_points: String(s.max_score), attempts_allowed: '1',
      show_results: false, is_published: false, created_by: String(teacherId),
      questions: [{
        question_type_id: String(essay?.id ?? 1), question_text: s.question_text,
        points: String(s.max_score), order_number: 1, required: true,
      }],
    });
    const assignmentId = asgRes?.json?.data?.id;

    // fetch the created question id
    let questionId;
    if (!DRY) {
      const list = unwrap(await api('GET', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments`), 'assignments-list');
      const mine = (list.data || []).find(x => x.id === assignmentId);
      questionId = mine?.questions?.[0]?.id;
    }

    // publish
    await api('PUT', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments/${assignmentId}/publish`, { is_published: true });

    // submit + teacher grade for each used answer
    for (const a of used) {
      const subRes = await api('POST', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments/${assignmentId}/submit`, {
        student_id: String(studentIds[a.student_code]),
        answers: [{ question_id: questionId, answer_text: a.answer_text }],
      });
      const submissionId = subRes?.json?.data?.id;
      await api('POST', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments/${assignmentId}/grade`, {
        submission_id: submissionId, grader_id: teacherId,
        feedback: `Skor acuan guru (set=${a.set})`,
        grades: [{ question_id: questionId, points_earned: a.score_teacher, feedback: '' }],
      });
    }

    // AI setup (vector store from grounding resource)
    if (!SKIP_AI) {
      await api('POST', '/api/assignments/create', {
        assignmentId, courseId,
        // config v1: grader scores on 0-100 (rubric max_score=100, matches the system prompt);
        // native score is derived downstream as round(score/100 * subject native max).
        rubric: [{
          questionId, max_score: 100,
          criteria: s.criteria, qualitative_scale: ['Excellent', 'Good', 'Fair', 'Poor'],
        }],
        resourceIds: [resourceId],
      });
    }

    summary.push({ subj, courseId, classId, sessionId, assignmentId, questionId, resourceId, students: used.length });
    console.log(`  ✓ ${subj}: assignment=${assignmentId} question=${questionId} students=${used.length} aiSetup=${!SKIP_AI}`);
  }

  // persist the id map so the 3x final-run script can find assignments/questions
  const mapPath = path.join(ROOT, 'docs/validation/automated-grading/ingest-ids.json');
  if (!DRY) {
    fs.writeFileSync(mapPath, JSON.stringify({ teacherId, teacherUser: 'val_teacher', subjects: summary }, null, 2));
    console.log(`\nwrote ${path.relative(ROOT, mapPath)}`);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
