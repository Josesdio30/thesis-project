#!/usr/bin/env node
/**
 * v2: add the 9 independent FILLER submissions per subject to the EXISTING PDS
 * assignments (8/9/10), making each class realistic (15 submissions, ~5.7%
 * suspicious). The 6 controlled submissions are already present from v1 ingest.
 *
 * Reads dataset.json (filler = group "F") and ingest-ids.json (existing
 * course/session/assignment/question ids). Creates filler students, submits
 * their answers, and appends them to ingest-ids.json.
 *
 * Prereqs: dev server up; ADMIN_USER/ADMIN_PASS.
 * Usage: ADMIN_USER=admin ADMIN_PASS=password node scripts/validation/add-filler-pds.mjs [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'docs/validation/plagiarism');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const STUDENT_PASS = requiredEnv('VAL_STUDENT_PASS');
const DRY = process.argv.includes('--dry-run');

const jar = new Map();
const setCookies = res => { for (const c of res.headers.getSetCookie?.() ?? []) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)); } };
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function api(method, p, body, { form = false } = {}) {
  if (DRY && method !== 'GET') { console.log(`  [dry] ${method} ${p} ${body ? JSON.stringify(body).slice(0, 90) : ''}`); return { ok: true, status: 200, json: {} }; }
  const headers = { cookie: cookieHeader() };
  let payload;
  if (body && form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE_URL + p, { method, headers, body: payload, redirect: 'manual' });
  setCookies(res);
  const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = { __raw: text }; }
  return { status: res.status, ok: res.ok, json };
}
async function login() {
  if (DRY) { console.log('  [dry] login'); return; }
  const csrf = await api('GET', '/api/auth/csrf');
  await api('POST', '/api/auth/callback/credentials?', { csrfToken: csrf.json?.csrfToken, username: ADMIN_USER, password: ADMIN_PASS, json: 'true' }, { form: true });
  if (!jar.has('next-auth.session-token') && !jar.has('__Secure-next-auth.session-token')) throw new Error('Admin login failed');
  console.log('  ✓ logged in as admin');
}

async function main() {
  const ds = JSON.parse(fs.readFileSync(path.join(DIR, 'dataset.json'), 'utf8'));
  const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'ingest-ids.json'), 'utf8'));
  await login();

  const STUDENT_ROLE = '1';
  for (const se of ids.subjects) {
    const dsS = ds.subjects[se.subj];
    const fillers = dsS.submissions.filter(x => x.group === 'F');
    const existing = new Set(se.students.map(s => s.code));
    console.log(`\n=== ${se.subj} (assignment ${se.assignmentId}) — adding ${fillers.length} filler ===`);
    for (const f of fillers) {
      if (existing.has(f.submission_code)) { console.log(`  skip ${f.submission_code} (already present)`); continue; }
      const uname = f.student_code.toLowerCase();
      const r = await api('POST', '/api/admin/users', {
        nama_lengkap: `Siswa ${f.submission_code}`, email: `${uname}@validation.local`,
        user_name: uname, password: STUDENT_PASS, role: STUDENT_ROLE,
        tanggal_lahir: '2009-01-01', nis: f.submission_code, nisn: '', parent_contact: '',
        class_id: String(se.classId),
      });
      let studentId = r?.json?.data?.id;
      if (!DRY && !studentId) {
        const users = (await api('GET', '/api/admin/users')).json;
        studentId = (users?.data?.users || []).find(u => u.user_name === uname)?.id;
      }
      const subRes = await api('POST', `/api/courses/${se.courseCode}/sessions/${se.sessionId}/assignments/${se.assignmentId}/submit`, {
        student_id: String(studentId), answers: [{ question_id: se.questionId, answer_text: f.answer_text }],
      });
      const submissionId = subRes?.json?.data?.id;
      se.students.push({ code: f.submission_code, student_code: f.student_code, id: studentId, submissionId });
      console.log(`  + ${f.submission_code} student=${studentId} submission=${submissionId} (src ${f.source_master_code})`);
    }
  }

  if (!DRY) {
    fs.writeFileSync(path.join(DIR, 'ingest-ids.json'), JSON.stringify(ids, null, 2));
    console.log('\nupdated docs/validation/plagiarism/ingest-ids.json');
  }
  console.log('Done.');
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
