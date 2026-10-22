#!/usr/bin/env node
/**
 * Re-index grounding for one or more subjects after editing a grounding .txt file.
 *
 * The AI-setup endpoint dedups uploads by resource_id, so editing the file in place does
 * NOT refresh the vector store. This uploads a FRESH resource (new resource_id) pointing at
 * the (updated) file on disk, then re-runs /api/assignments/create to rebuild the vector
 * store with the new content. Rubric is re-sent as config v1 (max_score=100 + per-subject criteria).
 *
 * Usage:
 *   RUN_USER=val_teacher RUN_PASS='<password>' node scripts/validation/reindex-grounding.mjs --only=agama
 *   (omit --only to re-index all three)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATASET = path.join(ROOT, 'docs/validation/automated-grading/dataset.json');
const IDS = path.join(ROOT, 'docs/validation/automated-grading/ingest-ids.json');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const RUN_USER = process.env.RUN_USER || 'val_teacher';
const RUN_PASS = requiredEnv('RUN_PASS', 'Password for the validation teacher account.');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || null;

const jar = new Map();
const setCookies = res => { for (const c of res.headers.getSetCookie?.() ?? []) { const [p] = c.split(';'); const i = p.indexOf('='); jar.set(p.slice(0, i), p.slice(i + 1)); } };
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function api(method, p, body, { form = false } = {}) {
  const h = { cookie: cookieHeader() }; let payload;
  if (body && form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE_URL + p, { method, headers: h, body: payload, redirect: 'manual' });
  setCookies(res); const t = await res.text();
  try { return { status: res.status, ok: res.ok, json: JSON.parse(t) }; } catch { return { status: res.status, ok: res.ok, json: { __raw: t } }; }
}
async function login() {
  const csrf = await api('GET', '/api/auth/csrf');
  if (!csrf.json?.csrfToken) throw new Error('No CSRF — server running?');
  await api('POST', '/api/auth/callback/credentials?', { csrfToken: csrf.json.csrfToken, username: RUN_USER, password: RUN_PASS, json: 'true' }, { form: true });
  if (![...jar.keys()].some(k => k.includes('session-token'))) throw new Error(`Login failed for ${RUN_USER}`);
  console.error(`  ✓ logged in as ${RUN_USER}`);
}

async function main() {
  const ds = JSON.parse(fs.readFileSync(DATASET, 'utf8')).subjects;
  const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
  const map = Object.fromEntries(ids.subjects.map(s => [s.subj, s]));
  const teacherId = ids.teacherId;
  await login();
  const subjects = ONLY ? [ONLY] : Object.keys(ds);
  for (const subj of subjects) {
    const s = ds[subj]; const m = map[subj];
    console.error(`\n=== reindex ${subj} (assignment ${m.assignmentId}) ===`);
    const up = await api('POST', `/api/courses/${s.course_code}/sessions`, {
      sessionId: String(m.sessionId), file_url: s.grounding_file,
      file_name: path.basename(s.grounding_file), file_type: 'txt',
      file_size: 0, content_type: 'text/plain', uploader_id: teacherId,
    });
    const resourceId = up.json?.data?.id;
    if (!resourceId) throw new Error(`resource upload failed: ${JSON.stringify(up.json)}`);
    const setup = await api('POST', '/api/assignments/create', {
      assignmentId: m.assignmentId, courseId: m.courseId,
      rubric: [{ questionId: m.questionId, max_score: 100, criteria: s.criteria, qualitative_scale: ['Excellent', 'Good', 'Fair', 'Poor'] }],
      resourceIds: [resourceId],
    });
    if (!setup.json?.success) throw new Error(`AI setup failed: ${JSON.stringify(setup.json)}`);
    console.error(`  ✓ resource=${resourceId} indexed=${setup.json.data?.files_indexed} vstore rebuilt`);
  }
  console.error('\nDone.');
}
main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
