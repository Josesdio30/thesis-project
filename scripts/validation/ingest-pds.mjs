#!/usr/bin/env node
/**
 * Endpoint-driven ingestion for the PLAGIARISM DETECTION validation test.
 *
 * Clone of ingest.mjs, adapted for the plagiarism phase:
 *   - reads docs/validation/plagiarism/dataset.json (built by build-pds-dataset.py)
 *   - stands up an ISOLATED set: reuse teacher `val_teacher`, 3 NEW classes + 3 NEW
 *     courses (`*-PDS`), 6 distinct students per subject, 1 assignment (1 essay Q),
 *     6 submissions each — UNGRADED (grade is irrelevant to detection).
 *   - enables the `plagiarism` feature per course (PUT /api/admin/access-control).
 *   - NO grading step, NO AI vector-store setup.
 *   - never touches the auto-grading courses (2/3/4).
 *
 * Prerequisites:
 *   - Dev server running (npm run dev) at BASE_URL.
 *   - An existing ADMIN account; export ADMIN_USER / ADMIN_PASS.
 *   - At least one academic_years row seeded.
 *
 * Usage:
 *   node scripts/validation/ingest-pds.mjs --dry-run
 *   ADMIN_USER=admin ADMIN_PASS=secret node scripts/validation/ingest-pds.mjs
 *   ... --only=geografi
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertDatasetDigest, requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATASET = path.join(ROOT, 'docs/validation/plagiarism/dataset.json');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const TEACHER_PASS = requiredEnv('VAL_TEACHER_PASS');
const STUDENT_PASS = requiredEnv('VAL_STUDENT_PASS');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
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

async function main() {
  assertDatasetDigest('plagiarism', path.join(ROOT, 'docs/validation/plagiarism/dataset.json'));
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8'));
  await login();

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

  // shared teacher (reuse val_teacher; create if missing)
  const teacherBody = {
    nama_lengkap: 'Guru Validasi AI', email: 'val_teacher@validation.local',
    user_name: 'val_teacher', password: TEACHER_PASS, role: roleId('teacher'),
    tanggal_lahir: '1990-01-01', kode_guru: 'VAL-GURU-01', niy: 'VAL0001',
  };
  const tRes = await api('POST', '/api/admin/users', teacherBody);
  let teacherId = tRes?.json?.data?.id;
  if (!DRY && !teacherId) {
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
      description: `Dataset validasi plagiarisme — ${subj}`,
    });
    let courseId = crsRes?.json?.course?.id;
    if (!DRY && !courseId) {
      const crs = unwrap(await api('GET', '/api/admin/courses'), 'courses');
      courseId = (crs?.data?.courses || []).find(c => c.course_code === s.course_code)?.id;
    }

    // enable plagiarism for this course (endpoint is PUT, not POST)
    const acRes = await api('PUT', '/api/admin/access-control', {
      course_id: String(courseId), feature: 'plagiarism', enabled: true,
    });
    if (!DRY && !acRes?.json?.success) {
      throw new Error(`enable plagiarism failed for course ${courseId}: ${JSON.stringify(acRes?.json)}`);
    }

    // session (creates class_course linking teacher + auto-enroll)
    const sesRes = await api('POST', '/api/admin/session', {
      title: `Sesi Validasi PDS ${subj}`, description: 'Sesi tunggal untuk uji plagiarisme',
      startTime: '08:00', endTime: '09:30', date: '2026-01-06',
      courseCode: s.course_code, teacherId: String(teacherId),
      classId: String(classId), sessionNumber: '1',
    });
    const sessionId = sesRes?.json?.data?.id;

    // students (6 distinct) with class_id => auto-enroll into the class_course
    const studentIds = {};
    for (const sub of s.submissions) {
      const uname = sub.student_code.toLowerCase();
      const r = await api('POST', '/api/admin/users', {
        nama_lengkap: `Siswa ${sub.submission_code}`, email: `${uname}@validation.local`,
        user_name: uname, password: STUDENT_PASS, role: roleId('student'),
        tanggal_lahir: '2009-01-01', nis: sub.submission_code, nisn: '', parent_contact: '',
        class_id: String(classId),
      });
      studentIds[sub.student_code] = r?.json?.data?.id;
    }
    if (!DRY) {
      const users = unwrap(await api('GET', '/api/admin/users'), 'users');
      for (const sub of s.submissions) {
        if (!studentIds[sub.student_code]) {
          studentIds[sub.student_code] = (users.data.users || []).find(u => u.user_name === sub.student_code.toLowerCase())?.id;
        }
      }
    }

    // assignment + 1 essay question
    const asgRes = await api('POST', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments`, {
      assignment_type_id: String(aType?.id ?? 1), title: `Tugas Validasi PDS ${subj}`,
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

    // submit each of the 6 answers (NO grading)
    const subIds = {};
    for (const sub of s.submissions) {
      const subRes = await api('POST', `/api/courses/${s.course_code}/sessions/${sessionId}/assignments/${assignmentId}/submit`, {
        student_id: String(studentIds[sub.student_code]),
        answers: [{ question_id: questionId, answer_text: sub.answer_text }],
      });
      subIds[sub.submission_code] = subRes?.json?.data?.id;
    }

    summary.push({
      subj, courseCode: s.course_code, courseId, classId, sessionId,
      assignmentId, questionId,
      students: s.submissions.map(x => ({ code: x.submission_code, student_code: x.student_code, id: studentIds[x.student_code], submissionId: subIds[x.submission_code] })),
    });
    console.log(`  ✓ ${subj}: assignment=${assignmentId} question=${questionId} submissions=${s.submissions.length} plagiarism=enabled`);
  }

  const mapPath = path.join(ROOT, 'docs/validation/plagiarism/ingest-ids.json');
  if (!DRY) {
    fs.writeFileSync(mapPath, JSON.stringify({ teacherId, teacherUser: 'val_teacher', subjects: summary }, null, 2));
    console.log(`\nwrote ${path.relative(ROOT, mapPath)}`);
  }
  console.log('\nDone.');
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
