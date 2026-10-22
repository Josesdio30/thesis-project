#!/usr/bin/env node
import { loadProjectEnv } from '../lib/load-env.cjs';
/**
 * Hardware benchmark for the local (Ollama) grading stack.
 *
 * Runs the validation harness (run-grading.mjs) against an already running app
 * server and records what the harness itself does not: VRAM, model load time,
 * generation speed, retrieval time, and whether the scores match the M4
 * reference run. Written for the RTX 16 GB deployment box (ops/rtx-runbook.md)
 * but runs anywhere Ollama runs.
 *
 * Usage:
 *   RUN_PASS='<password>' node scripts/validation/bench-local.mjs
 *   node scripts/validation/bench-local.mjs --dry-run
 *
 *   flags: --set=calib|final|both (default final)  --runs=N (default 1)
 *          --reference=<results.json>  (default: the M4 local results-final.json)
 *          --out-dir=<dir>  (default docs/validation/automated-grading/bench/<host>-<ts>/)
 *          --dry-run        preflight + environment only, no grading
 *
 * Env: BASE_URL (default http://localhost:3000), OLLAMA_BASE_URL (default
 * http://localhost:11434), OLLAMA_CHAT_MODEL, OLLAMA_EMBED_MODEL, AUX_POSTGRES_URL,
 * POSTGRES_SSL, RUN_USER, RUN_PASS. `.env` and `.env.local` are read; the shell
 * environment wins over both, and `.env.local` wins over `.env`.
 *
 * Exit code is non-zero only when preflight or the harness fails. Score
 * differences against the reference are a finding, not a failure: identical
 * scores across different GPUs are not guaranteed even with `seed: 0`.
 */
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const AG_DIR = path.join(ROOT, 'docs/validation/automated-grading');
const DEFAULT_REFERENCE = path.join(AG_DIR, 'results/local/results-final.json');
const HARNESS = path.join(__dirname, 'run-grading.mjs');
const DEFAULT_CHAT_MODEL = 'qwen2.5:14b-instruct-q4_K_M';
const DEFAULT_EMBED_MODEL = 'bge-m3';
const COLD_LOAD_MS = 1000;
const POLL_MS = 2000;

/* ── pure helpers (exported for bench-local.test.mjs) ───────────────────── */

/** Legacy parser retained for historical harness inputs; runtime uses loadProjectEnv. */
export function parseEnvFile(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

/**
 * Layers env files under the process environment. Later files win over earlier
 * ones (.env.local over .env); the shell wins over every file, so a value
 * passed on the command line is never silently replaced.
 */
export function mergeEnv(processEnv, fileEnvs) {
  const fromFiles = Object.assign({}, ...fileEnvs);
  const result = {};
  for (const [key, value] of Object.entries(fromFiles)) {
    if (processEnv[key] === undefined) result[key] = value;
  }
  return result;
}

const sorted = values =>
  values.filter(v => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);

export function median(values) {
  const a = sorted(values);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Nearest-rank percentile: the smallest value with at least p% of samples at or below it. */
export function percentile(values, p) {
  const a = sorted(values);
  if (!a.length) return null;
  const rank = Math.ceil((p / 100) * a.length);
  return a[Math.min(a.length, Math.max(1, rank)) - 1];
}

/** `bge-m3` and `bge-m3:latest` are the same model. */
export const normalizeModel = name => String(name).replace(/:latest$/, '');

export function missingModels(installed, required) {
  const have = new Set(installed.map(normalizeModel));
  return required.filter(m => !have.has(normalizeModel(m)));
}

/** One `/api/ps` response → total VRAM and per-model sizes. */
export function summarizePs(ps) {
  const models = {};
  let totalVram = 0;
  for (const m of ps?.models ?? []) {
    const name = m.name ?? m.model ?? 'unknown';
    const sizeVram = Number(m.size_vram) || 0;
    models[name] = {
      size: Number(m.size) || 0,
      size_vram: sizeVram,
      ...(m.context_length ? { context_length: m.context_length } : {}),
    };
    totalVram += sizeVram;
  }
  return { totalVram, models };
}

/** Folds one `/api/ps` sample into the running peaks. */
export function foldPsPeak(peak, ps) {
  const sample = summarizePs(ps);
  const next = {
    samples: (peak?.samples ?? 0) + 1,
    peak_total_vram_bytes: Math.max(peak?.peak_total_vram_bytes ?? 0, sample.totalVram),
    models: { ...(peak?.models ?? {}) },
  };
  for (const [name, m] of Object.entries(sample.models)) {
    const prev = next.models[name] ?? { size: 0, size_vram: 0 };
    next.models[name] = {
      size: Math.max(prev.size, m.size),
      size_vram: Math.max(prev.size_vram, m.size_vram),
      ...(m.context_length || prev.context_length
        ? { context_length: m.context_length ?? prev.context_length }
        : {}),
    };
  }
  return next;
}

/** `nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits` → MiB summed over GPUs. */
export function parseNvidiaMemoryUsed(stdout) {
  const values = String(stdout)
    .split(/\r?\n/)
    .map(l => parseFloat(l.trim()))
    .filter(Number.isFinite);
  return values.length ? values.reduce((t, v) => t + v, 0) : null;
}

/** `name, memory.total, driver_version` CSV → one object per GPU. */
export function parseNvidiaGpus(stdout) {
  return String(stdout)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const [name, memoryTotal, driver] = line.split(',').map(s => s.trim());
      return { name, memory_total: memoryTotal, driver_version: driver };
    });
}

/** Rows from acs_local_token_usage → the benchmark's latency/throughput stats. */
export function summarizeUsage(rows) {
  const num = key => rows.map(r => Number(r[key])).filter(Number.isFinite);
  const loads = num('load_ms');
  return {
    calls: rows.length,
    latency_ms_median: median(num('latency_ms')),
    latency_ms_p95: percentile(num('latency_ms'), 95),
    eval_tokens_per_sec_median: median(num('eval_tokens_per_sec')),
    load_ms_max: loads.length ? Math.max(...loads) : null,
    cold_loads: loads.filter(v => v > COLD_LOAD_MS).length,
    retrieval_ms_median: median(num('retrieval_ms')),
    models: [...new Set(rows.map(r => r.model).filter(Boolean))].sort(),
  };
}

/** `subject/student_code` → median_native for every record in a results file. */
export function scoreIndex(results) {
  const index = new Map();
  for (const [subject, s] of Object.entries(results?.subjects ?? {})) {
    for (const r of s.records ?? []) {
      index.set(`${subject}/${r.student_code}`, {
        subject,
        student_code: r.student_code,
        median_native: r.median_native ?? null,
      });
    }
  }
  return index;
}

/** Compares median_native for every answer present in both files. */
export function parityDiff(reference, bench) {
  const ref = scoreIndex(reference);
  const got = scoreIndex(bench);
  const differences = [];
  let identical = 0;
  for (const [key, r] of ref) {
    const b = got.get(key);
    if (!b) continue;
    if (r.median_native === b.median_native) {
      identical++;
    } else {
      differences.push({
        subject: r.subject,
        student_code: r.student_code,
        reference: r.median_native,
        bench: b.median_native,
        delta:
          r.median_native == null || b.median_native == null ? null : b.median_native - r.median_native,
      });
    }
  }
  return {
    compared: identical + differences.length,
    identical,
    differing: differences.length,
    differences,
    only_in_reference: [...ref.keys()].filter(k => !got.has(k)),
    only_in_bench: [...got.keys()].filter(k => !ref.has(k)),
  };
}

/** Filesystem-safe on Windows: no colons. */
export function timestampSlug(date) {
  const p = n => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

export const sanitizeHost = host => String(host).replace(/[^A-Za-z0-9._-]/g, '_');

export function parseArgs(argv) {
  const get = (k, d) => {
    const a = argv.find(x => x.startsWith(`--${k}=`));
    return a ? a.slice(k.length + 3) : d;
  };
  return {
    set: get('set', 'final'),
    runs: parseInt(get('runs', '1'), 10),
    reference: get('reference', null),
    outDir: get('out-dir', null),
    dryRun: argv.includes('--dry-run'),
  };
}

/** Mirrors lib/pg-ssl.ts so the bench connects the same way the app does. */
export function pgSsl(env) {
  const v = env.POSTGRES_SSL?.trim().toLowerCase();
  if (['false', 'off', '0', 'disable'].includes(v)) return false;
  if (['true', 'on', '1', 'require'].includes(v)) return { rejectUnauthorized: false };
  return undefined;
}

/** host:port/db only — never user or password. */
export function describeDbUrl(url) {
  if (!url) return 'not set';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}${u.pathname}`;
  } catch {
    return 'set (unparseable URL)';
  }
}

const gib = bytes => (bytes == null ? null : +(bytes / 1024 ** 3).toFixed(2));
const fmt = (v, digits = 0) => (v == null ? 'n/a' : Number(v).toFixed(digits));

export function renderSummary(bench) {
  const u = bench.usage ?? {};
  const v = bench.vram ?? {};
  const p = bench.parity;
  const lines = [
    `# Local grading benchmark — ${bench.environment.hostname}`,
    '',
    `- When: ${bench.started_at} → ${bench.finished_at ?? 'n/a'}`,
    `- GPU: ${(bench.environment.gpus ?? []).map(g => `${g.name} (${g.memory_total}, driver ${g.driver_version})`).join('; ') || 'none detected (nvidia-smi absent)'}`,
    `- Ollama ${bench.environment.ollama_version ?? 'n/a'}, Node ${bench.environment.node}, ${bench.environment.os}`,
    `- Harness: set=${bench.plan.set} runs=${bench.plan.runs} exit=${bench.harness?.exit_code ?? 'n/a'}`,
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Grading calls (token-usage rows) | ${u.calls ?? 'n/a'} |`,
    `| Latency median / p95 (ms) | ${fmt(u.latency_ms_median)} / ${fmt(u.latency_ms_p95)} |`,
    `| Generation speed median (tok/s) | ${fmt(u.eval_tokens_per_sec_median, 1)} |`,
    `| Retrieval median (ms) | ${fmt(u.retrieval_ms_median)} |`,
    `| Max load_ms / cold loads (>${COLD_LOAD_MS} ms) | ${fmt(u.load_ms_max)} / ${u.cold_loads ?? 'n/a'} |`,
    `| Models used | ${(u.models ?? []).join(', ') || 'n/a'} |`,
    `| Peak Ollama size_vram total (GiB) | ${fmt(gib(v.peak_total_vram_bytes), 2)} |`,
    ...Object.entries(v.models ?? {}).map(
      ([name, m]) => `| — ${name} size / size_vram (GiB) | ${fmt(gib(m.size), 2)} / ${fmt(gib(m.size_vram), 2)} |`
    ),
    `| nvidia-smi memory.used baseline / peak (MiB) | ${fmt(bench.nvidia?.baseline_mib)} / ${fmt(bench.nvidia?.peak_mib)} |`,
  ];
  if (p) {
    lines.push(
      `| Parity vs reference (identical / compared) | ${p.identical} / ${p.compared} |`,
      '',
      `Reference: \`${bench.plan.reference}\``
    );
    if (p.differences.length) {
      lines.push('', '| Answer | Reference | Bench | Δ |', '|---|---|---|---|');
      for (const d of p.differences) {
        lines.push(`| ${d.subject}/${d.student_code} | ${d.reference} | ${d.bench} | ${d.delta ?? 'n/a'} |`);
      }
    }
    lines.push(
      '',
      'Score differences across hardware are a finding, not a failure: `seed: 0` makes a run',
      'reproducible on one machine, but GPU kernels may round differently.'
    );
  }
  return lines.join('\n') + '\n';
}

/* ── side-effecting parts ───────────────────────────────────────────────── */


async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function run(cmd, args, timeoutMs = 5000) {
  return new Promise(resolve => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (error, stdout) =>
      resolve(error ? null : stdout)
    );
  });
}

const nvidiaGpus = async () => {
  const out = await run('nvidia-smi', ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader']);
  return out ? parseNvidiaGpus(out) : null;
};
const nvidiaUsedMib = async () => {
  const out = await run('nvidia-smi', ['--query-gpu=memory.used', '--format=csv,noheader,nounits']);
  return out ? parseNvidiaMemoryUsed(out) : null;
};

function auxClient() {
  return new pg.Client({ connectionString: process.env.AUX_POSTGRES_URL, ssl: pgSsl(process.env) });
}

async function preflight(ctx, { needHarness }) {
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, ...(ok ? {} : { fix }) });

  // Ollama + models
  try {
    const tags = await fetchJson(`${ctx.ollamaUrl}/api/tags`);
    const installed = (tags.models ?? []).map(m => m.name);
    add('ollama reachable', true, ctx.ollamaUrl);
    const missing = missingModels(installed, [ctx.chatModel, ctx.embedModel]);
    add(
      'models pulled',
      missing.length === 0,
      missing.length ? `missing: ${missing.join(', ')}` : `${ctx.chatModel}, ${ctx.embedModel}`,
      missing.map(m => `ollama pull ${m}`).join('  &&  ')
    );
  } catch (e) {
    add('ollama reachable', false, `${ctx.ollamaUrl}: ${e.message}`,
      'Start Ollama (`ollama serve`, or the Ollama service/app) or set OLLAMA_BASE_URL.');
  }

  // App server
  try {
    const csrf = await fetchJson(`${ctx.baseUrl}/api/auth/csrf`);
    add('app answering', Boolean(csrf?.csrfToken), `${ctx.baseUrl}/api/auth/csrf`,
      'The server answered but returned no CSRF token; is BASE_URL pointing at this LMS?');
  } catch (e) {
    add('app answering', false, `${ctx.baseUrl}: ${e.cause?.code ?? e.message}`,
      'Start the app with `npm run build && npm start` (not `next dev`) or set BASE_URL.');
  }

  // Aux DB (token-usage stats)
  if (!process.env.AUX_POSTGRES_URL) {
    add('aux db', false, 'AUX_POSTGRES_URL not set', 'Set AUX_POSTGRES_URL in .env.local.');
  } else {
    const client = auxClient();
    try {
      await client.connect();
      await client.query('SELECT 1 FROM acs_local_token_usage LIMIT 1');
      add('aux db', true, describeDbUrl(process.env.AUX_POSTGRES_URL));
    } catch (e) {
      add('aux db', false, `${describeDbUrl(process.env.AUX_POSTGRES_URL)}: ${e.message}`,
        'Check Postgres is running, POSTGRES_SSL, and that `npm run db2:migrate` has run.');
    } finally {
      await client.end().catch(() => {});
    }
  }

  // Harness inputs (docs/ is gitignored, so these must be copied over by hand)
  for (const [label, file] of [
    ['dataset.json', path.join(AG_DIR, 'dataset.json')],
    ['ingest-ids.json', path.join(AG_DIR, 'ingest-ids.json')],
    ['reference results', ctx.reference],
  ]) {
    add(label, fs.existsSync(file), path.relative(ROOT, file),
      'Copy docs/validation/automated-grading/ from the M4 machine (see ops/rtx-runbook.md).');
  }

  if (!['calib', 'final', 'both'].includes(ctx.plan.set)) {
    add('--set', false, ctx.plan.set, 'Use --set=calib, final or both.');
  }
  if (!Number.isInteger(ctx.plan.runs) || ctx.plan.runs < 1) {
    add('--runs', false, String(ctx.plan.runs), 'Use a positive integer, e.g. --runs=1.');
  }
  const hasPass = Boolean(process.env.RUN_PASS && process.env.RUN_PASS.trim());
  if (needHarness || hasPass) {
    add('RUN_PASS', hasPass, hasPass ? 'set' : 'missing',
      "Pass the validation teacher's password: RUN_PASS='…' node scripts/validation/bench-local.mjs");
  } else {
    checks.push({ name: 'RUN_PASS', ok: true, detail: 'missing (only needed for a real run)', warn: true });
  }
  return checks;
}

async function captureEnvironment(ollamaUrl) {
  let ollamaVersion = null;
  try {
    ollamaVersion = (await fetchJson(`${ollamaUrl}/api/version`)).version ?? null;
  } catch {}
  const cpus = os.cpus();
  // Knobs only: none of these are secrets. Ollama server knobs are what THIS
  // shell sees; the Ollama service may have been started with different ones.
  const knobs = [
    'AI_PROVIDER', 'OLLAMA_CHAT_MODEL', 'OLLAMA_EMBED_MODEL', 'OLLAMA_EMBED_DIMS', 'OLLAMA_NUM_CTX',
    'OLLAMA_NUM_PREDICT', 'OLLAMA_KEEP_ALIVE', 'OLLAMA_MAX_LOADED_MODELS', 'OLLAMA_NUM_PARALLEL',
    'OLLAMA_FLASH_ATTENTION', 'OLLAMA_KV_CACHE_TYPE', 'LOCAL_RAG_TOP_K', 'LOCAL_LLM_CONCURRENCY',
    'LOCAL_EMBED_CONCURRENCY', 'LOCAL_SCORING_MODE', 'LOCAL_SYSTEM_PROMPT_FILE', 'POSTGRES_SSL',
  ];
  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`,
    cpu: `${cpus[0]?.model?.trim() ?? 'unknown'} × ${cpus.length}`,
    total_ram_gib: gib(os.totalmem()),
    node: process.version,
    ollama_version: ollamaVersion,
    gpus: await nvidiaGpus(),
    knobs: Object.fromEntries(knobs.filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]])),
  };
}

function printChecks(checks) {
  for (const c of checks) {
    const mark = c.ok ? (c.warn ? '!' : '✓') : '✗';
    console.error(`  ${mark} ${c.name.padEnd(18)} ${c.detail}`);
    if (!c.ok && c.fix) console.error(`      → ${c.fix}`);
  }
}

function startSampler(ctx) {
  const state = { ps: null, nvidiaPeak: null, errors: 0 };
  const tick = async () => {
    try {
      state.ps = foldPsPeak(state.ps, await fetchJson(`${ctx.ollamaUrl}/api/ps`, 1500));
    } catch {
      state.errors++;
    }
    if (ctx.hasNvidia) {
      const used = await nvidiaUsedMib();
      if (used != null) state.nvidiaPeak = Math.max(state.nvidiaPeak ?? 0, used);
    }
  };
  tick();
  const timer = setInterval(tick, POLL_MS);
  return {
    stop: async () => {
      clearInterval(timer);
      await tick();
      return state;
    },
  };
}

function runHarness(ctx, logPath) {
  return new Promise(resolve => {
    const args = [
      HARNESS,
      `--set=${ctx.plan.set}`,
      `--runs=${ctx.plan.runs}`,
      `--config-label=bench-${ctx.host}`,
      `--out=${ctx.resultsPath}`,
    ];
    const log = fs.createWriteStream(logPath);
    const child = spawn(process.execPath, args, { cwd: ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', chunk => {
        process.stderr.write(chunk);
        log.write(chunk);
      });
    }
    child.on('error', e => {
      log.end();
      resolve({ exit_code: -1, error: e.message });
    });
    child.on('close', code => {
      log.end();
      resolve({ exit_code: code });
    });
  });
}

async function readUsage(since) {
  const client = auxClient();
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT latency_ms, load_ms, eval_tokens_per_sec, retrieval_ms, model, created_at
         FROM acs_local_token_usage WHERE created_at >= $1 ORDER BY created_at`,
      [since]
    );
    return rows;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  loadProjectEnv();
  const plan = parseArgs(process.argv.slice(2));
  const host = sanitizeHost(os.hostname());
  const startedAt = new Date();
  const outDir = path.resolve(
    ROOT,
    plan.outDir ?? path.join(AG_DIR, 'bench', `${host}-${timestampSlug(startedAt)}`)
  );
  const ctx = {
    plan,
    host,
    ollamaUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, ''),
    baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    chatModel: process.env.OLLAMA_CHAT_MODEL || DEFAULT_CHAT_MODEL,
    embedModel: process.env.OLLAMA_EMBED_MODEL || DEFAULT_EMBED_MODEL,
    reference: path.resolve(ROOT, plan.reference ?? DEFAULT_REFERENCE),
    outDir,
    resultsPath: path.join(outDir, 'results.json'),
  };

  console.error(`\n── bench-local ${plan.dryRun ? '(dry run) ' : ''}──`);
  const environment = await captureEnvironment(ctx.ollamaUrl);
  ctx.hasNvidia = Array.isArray(environment.gpus) && environment.gpus.length > 0;

  console.error('\nEnvironment');
  console.error(`  host     ${environment.hostname}`);
  console.error(`  os       ${environment.os}`);
  console.error(`  cpu      ${environment.cpu}`);
  console.error(`  ram      ${environment.total_ram_gib} GiB`);
  console.error(`  node     ${environment.node}`);
  console.error(`  ollama   ${environment.ollama_version ?? 'unreachable'}`);
  console.error(`  gpu      ${ctx.hasNvidia ? environment.gpus.map(g => `${g.name}, ${g.memory_total}, driver ${g.driver_version}`).join('; ') : 'nvidia-smi not found (skipped)'}`);
  for (const [k, v] of Object.entries(environment.knobs)) console.error(`  ${k}=${v}`);

  const planOut = {
    set: plan.set,
    runs: plan.runs,
    base_url: ctx.baseUrl,
    ollama_base_url: ctx.ollamaUrl,
    chat_model: ctx.chatModel,
    embed_model: ctx.embedModel,
    reference: path.relative(ROOT, ctx.reference),
    out_dir: path.relative(ROOT, outDir),
    run_user: process.env.RUN_USER || 'val_teacher',
    aux_db: describeDbUrl(process.env.AUX_POSTGRES_URL),
  };
  console.error('\nPlan');
  for (const [k, v] of Object.entries(planOut)) console.error(`  ${k.padEnd(16)} ${v}`);
  console.error(`  harness          node scripts/validation/run-grading.mjs --set=${plan.set} --runs=${plan.runs} --config-label=bench-${host} --out=${path.relative(ROOT, ctx.resultsPath)}`);

  console.error('\nPreflight');
  const checks = await preflight(ctx, { needHarness: !plan.dryRun });
  printChecks(checks);
  const failed = checks.filter(c => !c.ok);

  if (failed.length) {
    console.error(`\n✗ preflight failed (${failed.map(c => c.name).join(', ')}). Fix the items above and re-run.`);
    process.exit(1);
  }
  if (plan.dryRun) {
    console.error('\n✓ dry run: preflight passed, nothing graded.');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const nvidiaBaseline = ctx.hasNvidia ? await nvidiaUsedMib() : null;
  // A second of slack so a row stamped by the DB clock just before ours still counts.
  const since = new Date(Date.now() - 1000);
  console.error(`\nGrading — started ${since.toISOString()}; sampling /api/ps every ${POLL_MS / 1000}s\n`);
  const sampler = startSampler(ctx);
  const harness = await runHarness(ctx, path.join(outDir, 'harness.log'));
  const sampled = await sampler.stop();
  const finishedAt = new Date();

  let usage = null;
  let usageError = null;
  try {
    usage = summarizeUsage(await readUsage(since));
  } catch (e) {
    usageError = e.message;
  }

  let parity = null;
  if (fs.existsSync(ctx.resultsPath)) {
    const reference = JSON.parse(fs.readFileSync(ctx.reference, 'utf8'));
    const results = JSON.parse(fs.readFileSync(ctx.resultsPath, 'utf8'));
    parity = parityDiff(reference, results);
    planOut.reference_config = { config_label: reference.config_label, runs: reference.runs };
  }

  const bench = {
    started_at: since.toISOString(),
    finished_at: finishedAt.toISOString(),
    wall_ms: finishedAt - since,
    plan: planOut,
    environment,
    harness,
    usage,
    ...(usageError ? { usage_error: usageError } : {}),
    vram: sampled.ps,
    ps_poll_errors: sampled.errors,
    nvidia: ctx.hasNvidia ? { baseline_mib: nvidiaBaseline, peak_mib: sampled.nvidiaPeak } : null,
    parity,
  };

  fs.writeFileSync(path.join(outDir, 'bench.json'), JSON.stringify(bench, null, 2));
  const summary = renderSummary(bench);
  fs.writeFileSync(path.join(outDir, 'SUMMARY.md'), summary);
  console.log('\n' + summary);
  console.error(`wrote ${path.relative(ROOT, outDir)}/{bench.json,SUMMARY.md,results.json,harness.log}`);

  if (harness.exit_code !== 0) {
    console.error(`\n✗ harness exited with ${harness.exit_code}${harness.error ? `: ${harness.error}` : ''}; see harness.log.`);
    process.exit(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch(e => {
    console.error(`\nbench-local: ${e.message}`);
    process.exit(1);
  });
}
