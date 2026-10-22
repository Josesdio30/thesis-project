#!/usr/bin/env node
/**
 * Run the AI grader over a set of validation answers, N times each (external reliability
 * procedure — the runtime grades 1x/answer, so we trigger it repeatedly here), convert the
 * 0-100 model score to native scale, and record run1..runN + median.
 *
 * Reads dataset.json (answers + teacher scores) and ingest-ids.json (assignment/question ids).
 *
 * Usage:
 *   RUN_USER=val_teacher RUN_PASS='<password>' \
 *     node scripts/validation/run-grading.mjs --set=calib --runs=1
 *   flags: --set=calib|final|both (default calib)  --runs=N (default 3)
 *          --only=geografi  --out=<path>  --config-label=v0
 *          --ids=<file>        assignment/question ids (default ingest-ids.json); v3 uses cloned setups
 *          --scale=native      the rubric max_score is the native max, so the model scores natively
 *          --exclude=A,B       skip these student codes (e.g. answers shown to the model as examples)
 *          --shard=i/n         grade only every n-th answer starting at i, so n harness processes
 *                              (each with its own BASE_URL) can grade one set in parallel
 *
 * Native conversion (config v1): native = round(rawScore / 100 * max_score).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { announceRun, assertDatasetDigest, resultsDir, requiredEnv } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATASET = path.join(ROOT, 'docs/validation/automated-grading/dataset.json');
const DEFAULT_IDS = path.join(ROOT, 'docs/validation/automated-grading/ingest-ids.json');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const RUN_USER = process.env.RUN_USER || 'val_teacher';
const RUN_PASS = requiredEnv('RUN_PASS', 'Password for the validation teacher account.');

const args = process.argv.slice(2);
const arg = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const SET = arg('set', 'calib');
const RUNS = parseInt(arg('runs', '3'), 10);
const ONLY = arg('only', null);
const LABEL = arg('config-label', 'v0');
const OUT = arg('out', path.join(resultsDir(ROOT, 'automated-grading'), `results-${SET}.json`));
const IDS = path.resolve(ROOT, arg('ids', DEFAULT_IDS));
const SCALE = arg('scale', 'percent');
if (!['percent', 'native'].includes(SCALE)) throw new Error(`--scale must be percent or native, got ${SCALE}`);
const EXCLUDE = new Set((arg('exclude', '') || '').split(',').filter(Boolean));
const [SHARD_I, SHARD_N] = (arg('shard', '0/1') || '0/1').split('/').map(Number);
if (!(SHARD_N >= 1 && SHARD_I >= 0 && SHARD_I < SHARD_N)) throw new Error('--shard must look like i/n with 0 <= i < n');

// ── cookie jar + api ──────────────────────────────────────────────────────────
const jar = new Map();
function setCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';'); const i = pair.indexOf('=');
    jar.set(pair.slice(0, i), pair.slice(i + 1));
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
async function api(method, p, body, { form = false } = {}) {
  const headers = { cookie: cookieHeader() };
  let payload;
  if (body && form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(body).toString(); }
  else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE_URL + p, { method, headers, body: payload, redirect: 'manual' });
  setCookies(res);
  const text = await res.text();
  try { return { status: res.status, ok: res.ok, json: JSON.parse(text) }; }
  catch { return { status: res.status, ok: res.ok, json: { __raw: text } }; }
}
async function login() {
  const csrf = await api('GET', '/api/auth/csrf');
  const csrfToken = csrf.json?.csrfToken;
  if (!csrfToken) throw new Error('No CSRF token — is the server running?');
  await api('POST', '/api/auth/callback/credentials?', { csrfToken, username: RUN_USER, password: RUN_PASS, json: 'true' }, { form: true });
  if (![...jar.keys()].some(k => k.includes('session-token'))) throw new Error(`Login failed for ${RUN_USER}. Check RUN_USER/RUN_PASS.`);
  console.error(`  ✓ logged in as ${RUN_USER}`);
}

const median = arr => {
  const a = arr.filter(x => x != null).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

async function main() {
  const provider = announceRun('automated-grading');
  assertDatasetDigest('automated-grading', DATASET);
  if (!fs.existsSync(IDS)) throw new Error('ingest-ids.json not found — run ingest.mjs first.');
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8')).subjects;
  const ids = JSON.parse(fs.readFileSync(IDS, 'utf8'));
  const idMap = Object.fromEntries(ids.subjects.map(s => [s.subj, s]));
  await login();

  const sets = SET === 'both' ? ['calib', 'final'] : [SET];
  const subjects = (ONLY ? [ONLY] : Object.keys(dataset));
  const out = {
    config_label: LABEL, provider, set: SET, runs: RUNS, generated_at: new Date().toISOString(),
    ids_file: path.relative(ROOT, IDS), scale: SCALE, excluded: [...EXCLUDE], shard: `${SHARD_I}/${SHARD_N}`, subjects: {},
  };
  // A null score means the model's JSON did not parse and the runtime
  // substituted a placeholder. median() filters nulls out, so a half-failed run
  // would otherwise report a BETTER-looking median over fewer samples. This is
  // the single most misleading outcome the harness can produce, so it is
  // counted per subject and printed prominently.
  const nullCounts = {};

  for (const subj of subjects) {
    const s = dataset[subj];
    const { assignmentId, questionId } = idMap[subj];
    const answers = s.answers
      .filter(a => sets.includes(a.set) && !EXCLUDE.has(a.student_code))
      .filter((_, i) => i % SHARD_N === SHARD_I);
    console.error(`\n=== ${subj}: ${answers.length} answers x ${RUNS} runs (max=${s.max_score}) ===`);
    const records = [];
    let subjectNulls = 0, subjectCalls = 0;
    for (const a of answers) {
      const runsRaw = [], runsNative = [], meta = [], latencies = [];
      for (let r = 1; r <= RUNS; r++) {
        const t0 = Date.now();
        const res = await api('POST', '/api/ai-grading/run-single', {
          assignmentId: String(assignmentId), studentId: a.student_code,
          questionId: questionId, studentAnswer: a.answer_text,
          // Improves local retrieval; the OpenAI path ignores it, so both arms
          // still receive an identical request body.
          questionText: s.question_text,
        });
        const latencyMs = Date.now() - t0;
        latencies.push(latencyMs);
        subjectCalls++;
        const g = res.json?.data;
        if (!res.ok || !g) { console.error(`  ! ${a.student_code} run${r} ERROR: ${JSON.stringify(res.json).slice(0,160)}`); runsRaw.push(null); runsNative.push(null); meta.push(null); subjectNulls++; continue; }
        const raw = g.score; // model score on its OWN declared scale (g.max_score)
        if (raw == null) subjectNulls++;
        const mmax = (typeof g.max_score === 'number' && g.max_score > 0) ? g.max_score : 100;
        // native scale: the rubric max IS the native max and the service clamps to it,
        // so the model's own max_score is not trusted for conversion.
        const native = raw == null ? null
          : SCALE === 'native' ? Math.min(s.max_score, Math.max(0, Math.round(raw)))
          : Math.min(s.max_score, Math.max(0, Math.round(raw / mmax * s.max_score)));
        runsRaw.push(raw); runsNative.push(native);
        meta.push({ qualitative: g.qualitative_grade, confidence: g.confidence, model_max: mmax, scale_corrupt: raw != null && raw > mmax, citations: g.citations?.length ?? 0 });
        process.stderr.write(`  ${a.student_code} run${r}: raw=${raw} native=${native} (guru=${a.score_teacher}) ${latencyMs}ms\n`);
      }
      const medNative = median(runsNative), medRaw = median(runsRaw);
      const validNative = runsNative.filter(x => x != null);
      records.push({
        student_code: a.student_code, set: a.set, score_teacher: a.score_teacher, max_score: s.max_score,
        runs_raw: runsRaw, runs_native: runsNative, meta,
        median_raw: medRaw, median_native: medNative,
        spread_native: validNative.length ? Math.max(...validNative) - Math.min(...validNative) : null,
        gap_native: medNative == null ? null : medNative - a.score_teacher,
        latency_ms: latencies,
        median_latency_ms: median(latencies),
      });
    }
    nullCounts[subj] = { nulls: subjectNulls, calls: subjectCalls };
    const pct = subjectCalls ? (subjectNulls / subjectCalls) * 100 : 0;
    console.error(`  → ${subj}: ${subjectNulls}/${subjectCalls} null scores (${pct.toFixed(1)}%)${pct > 2 ? '  ⚠ ABOVE THE 2% THRESHOLD' : ''}`);
    out.subjects[subj] = { max_score: s.max_score, tolerance: s.tolerance, records };
  }

  const totalNulls = Object.values(nullCounts).reduce((t, c) => t + c.nulls, 0);
  const totalCalls = Object.values(nullCounts).reduce((t, c) => t + c.calls, 0);
  const nullPct = totalCalls ? (totalNulls / totalCalls) * 100 : 0;
  out.null_fallbacks = { ...nullCounts, total: { nulls: totalNulls, calls: totalCalls, pct: nullPct } };

  console.error(`\n── null-score fallbacks: ${totalNulls}/${totalCalls} (${nullPct.toFixed(1)}%) ──`);
  if (nullPct > 2) {
    console.error('  ⚠ Above 2%. The medians in this file are computed over a REDUCED sample');
    console.error('    and are NOT comparable to a run with no fallbacks. Treat as invalid.');
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // Merge with any existing results so a scoped re-run (e.g. --only=agama) preserves the
  // other subjects' baseline instead of overwriting the whole file.
  let existing = {};
  if (fs.existsSync(OUT)) { try { existing = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch {} }
  const merged = { ...out, subjects: { ...(existing.subjects || {}), ...out.subjects } };
  fs.writeFileSync(OUT, JSON.stringify(merged, null, 2));
  console.error(`\nwrote ${path.relative(ROOT, OUT)} (subjects: ${Object.keys(merged.subjects).join(', ')})`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
