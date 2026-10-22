#!/usr/bin/env node
/**
 * Builds the local RAG corpora for the grading validation assignments.
 *
 * The OpenAI arm's grounding lives in an OpenAI Vector Store, which the local
 * provider cannot read. This drives the real POST /api/assignments/create
 * endpoint against a server running with AI_PROVIDER=local, so the corpus is
 * produced by exactly the code path a teacher would trigger.
 *
 * The rubric is copied verbatim from `acs_assignments`, so both arms grade
 * against a byte-identical rubric — otherwise the comparison would confound
 * the model with the rubric.
 *
 * Usage:
 *   AI_PROVIDER=local BASE_URL=http://localhost:3947 \
 *   node --env-file=.env --env-file=.env.local scripts/validation/setup-local-corpora.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const IDS = path.join(ROOT, 'docs/validation/automated-grading/ingest-ids.json');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = requiredEnv('ADMIN_USER');
const ADMIN_PASS = requiredEnv('ADMIN_PASS');
const aux = new Pool({ connectionString: requiredEnv('AUX_POSTGRES_URL') });

const jar = new Map();
const setCookies = res => {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
};
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

async function api(method, p, body, { form = false } = {}) {
  const headers = { cookie: cookieHeader() };
  let payload;
  if (body && form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE_URL + p, { method, headers, body: payload, redirect: 'manual' });
  setCookies(res);
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { __raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}

async function login() {
  const csrf = await api('GET', '/api/auth/csrf');
  await api('POST', '/api/auth/callback/credentials?',
    { csrfToken: csrf.json.csrfToken, username: ADMIN_USER, password: ADMIN_PASS, json: 'true' }, { form: true });
  if (![...jar.keys()].some(k => k.includes('session-token'))) throw new Error('Admin login failed');
  console.error('  ✓ logged in as admin');
}

async function main() {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  console.error(`\n── building corpora: AI_PROVIDER=${provider} ──`);
  if (provider !== 'local') throw new Error('Run this with AI_PROVIDER=local; the OpenAI arm already has its vector stores.');

  const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
  await login();

  for (const subj of ids.subjects) {
    const assignmentId = String(subj.assignmentId);
    const { rows } = await aux.query(
      'SELECT course_id, rubric FROM acs_assignments WHERE assignment_id = $1', [assignmentId]);
    if (!rows[0]) throw new Error(`No acs_assignments row for ${assignmentId} — cannot copy the rubric`);

    const { rows: files } = await aux.query(
      'SELECT DISTINCT resource_id FROM acs_uploaded_files WHERE assignment_id = $1 AND resource_id IS NOT NULL', [assignmentId]);
    const resourceIds = files.map(f => f.resource_id).sort((a, b) => a - b);

    console.error(`\n=== ${subj.subj} (assignment ${assignmentId}, resources ${resourceIds.join(',')}) ===`);
    const res = await api('POST', '/api/assignments/create', {
      assignmentId, courseId: rows[0].course_id, rubric: rows[0].rubric, resourceIds,
    });
    if (!res.ok) throw new Error(`create failed (${res.status}): ${JSON.stringify(res.json).slice(0, 300)}`);
    const d = res.json.data;
    console.error(`  corpus=${d.vector_store_id}  indexed=${d.files_indexed} reused=${d.files_reused} uploaded=${d.files_uploaded} failed=${d.files_failed}`);
    if (d.warning) console.error(`  warning: ${d.warning}`);
  }
  await aux.end();
  console.error('\nlocal corpora ready');
}

main().catch(async e => { console.error('\nFATAL:', e.message); try { await aux.end(); } catch {} process.exit(1); });
