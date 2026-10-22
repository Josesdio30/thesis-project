#!/usr/bin/env node
/**
 * Runs the REAL plagiarism detector (system of record) for the 3 PDS validation
 * assignments and exports every stored comparison's raw scores.
 *
 * Flow per assignment:
 *   1. POST /api/plagiarism/detect { assignmentId } -> detectionId (async processing)
 *   2. poll pds_detections.status until completed/failed
 *   3. read pds_comparisons for this assignment's submissions
 *
 * The engine only persists pairs with combined >= 0.40 (LOW). Pairs not present
 * are, by definition, combined < 0.40 -> NONE. The downstream metrics script
 * fills those in from the ground-truth pair list.
 *
 * Prereqs: dev server running; ADMIN_USER/ADMIN_PASS; AUX_POSTGRES_URL in env
 *          (run with: node --env-file=.env --env-file=.env.local ...).
 *
 * Usage:
 *   ADMIN_USER=admin ADMIN_PASS=password \
 *   node --env-file=.env --env-file=.env.local scripts/validation/run-pds-detect.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { announceRun, assertDatasetDigest, pdsTablePrefix, resultsDir } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const IDS = path.join(ROOT, 'docs/validation/plagiarism/ingest-ids.json');
const DATASET = path.join(ROOT, 'docs/validation/plagiarism/dataset.json');

// The server writes wherever AI_PROVIDER points it; the harness must read the
// same tables or it will silently report the other arm's numbers.
const T = pdsTablePrefix();
const OUT = resultsDir(ROOT, 'plagiarism');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const AUX = process.env.AUX_POSTGRES_URL;
if (!AUX) throw new Error('Missing AUX_POSTGRES_URL (run with --env-file=.env --env-file=.env.local)');

const aux = new Pool({ connectionString: AUX });

// ── cookie jar + api (NextAuth credentials login) ─────────────────────────────
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
  let json; try { json = JSON.parse(text); } catch { json = { __raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function login() {
  const csrf = await api('GET', '/api/auth/csrf');
  const csrfToken = csrf.json?.csrfToken;
  if (!csrfToken) throw new Error('No CSRF token — server up?');
  await api('POST', '/api/auth/callback/credentials?', { csrfToken, username: ADMIN_USER, password: ADMIN_PASS, json: 'true' }, { form: true });
  if (!jar.has('next-auth.session-token') && !jar.has('__Secure-next-auth.session-token'))
    throw new Error('Admin login failed — check ADMIN_USER/ADMIN_PASS');
  console.log('  ✓ logged in as admin');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function pollStatus(detectionId, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const { rows } = await aux.query(
      `SELECT status, total_submissions, processed_submissions, error_message FROM ${T}detections WHERE id = $1`, [detectionId]);
    const st = rows[0];
    if (st && (st.status === 'completed' || st.status === 'failed')) return st;
    await sleep(2000);
  }
  return { status: 'timeout' };
}

async function main() {
  const provider = announceRun('plagiarism');
  assertDatasetDigest('plagiarism', DATASET);
  console.error(`  reading ${T}detections / ${T}comparisons`);
  fs.mkdirSync(OUT, { recursive: true });
  const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
  await login();

  const allRows = [];
  for (const subj of ids.subjects) {
    const assignmentId = String(subj.assignmentId);
    // submissionId -> slot code map for labelling
    const idToCode = {};
    for (const s of subj.students) idToCode[String(s.submissionId)] = s.code.split('-').pop(); // S1..S6
    console.log(`\n=== ${subj.subj} (assignment ${assignmentId}) ===`);

    const det = await api('POST', '/api/plagiarism/detect', { assignmentId });
    const detectionId = det.json?.detectionId;
    if (!detectionId) throw new Error(`detect failed: ${JSON.stringify(det.json)}`);
    console.log(`  detectionId=${detectionId} → polling…`);

    const st = await pollStatus(detectionId);
    console.log(`  status=${st.status} processed=${st.processed_submissions}/${st.total_submissions}${st.error_message ? ' err=' + st.error_message : ''}`);
    if (st.status !== 'completed') throw new Error(`detection ${st.status} for ${subj.subj}`);

    const subIds = subj.students.map(s => String(s.submissionId));
    const { rows } = await aux.query(
      `SELECT source_submission_id, target_submission_id, semantic_score, lexical_score,
              combined_score, risk_level, matched_chunks
         FROM ${T}comparisons
        WHERE source_submission_id = ANY($1) AND target_submission_id = ANY($1)`, [subIds]);

    for (const r of rows) {
      const a = idToCode[String(r.source_submission_id)];
      const b = idToCode[String(r.target_submission_id)];
      const [s1, s2] = [a, b].sort();
      allRows.push({
        subject: subj.subj, assignment_id: subj.assignmentId, detection_id: detectionId,
        pair: `${s1}-${s2}`, a: s1, b: s2,
        semantic: Number(r.semantic_score), lexical: Number(r.lexical_score),
        combined: Number(r.combined_score), risk: r.risk_level,
      });
    }
    console.log(`  stored comparisons (combined>=0.40): ${rows.length}`);
  }

  const outPath = path.join(OUT, 'raw-comparisons.json');
  // Provider and table prefix are recorded in the artefact itself so a results
  // file can never be misattributed to the wrong arm.
  fs.writeFileSync(outPath, JSON.stringify(
    { provider, table_prefix: T, generated_at: new Date().toISOString(), pairs: allRows },
    null, 2));
  console.log(`\nwrote ${path.relative(ROOT, outPath)} (${allRows.length} stored pairs)`);
  await aux.end();
}

main().catch(async e => { console.error('\nFATAL:', e.message); try { await aux.end(); } catch {} process.exit(1); });
