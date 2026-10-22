// node --test scripts/validation/bench-local.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeDbUrl,
  foldPsPeak,
  median,
  mergeEnv,
  missingModels,
  parityDiff,
  parseArgs,
  parseEnvFile,
  parseNvidiaGpus,
  parseNvidiaMemoryUsed,
  percentile,
  pgSsl,
  renderSummary,
  sanitizeHost,
  summarizePs,
  summarizeUsage,
  timestampSlug,
} from './bench-local.mjs';

test('parseEnvFile reads KEY=value, strips quotes, ignores comments and CRLF', () => {
  const env = parseEnvFile('# c\nA=1\r\nB = "two"\nC=\'three\'\n  D=x=y\nnot a line\n');
  assert.deepEqual(env, { A: '1', B: 'two', C: 'three', D: 'x=y' });
});

test('mergeEnv: .env.local wins over .env, the shell wins over both', () => {
  const merged = mergeEnv({ SHELL_SET: 'shell' }, [
    { A: 'env', SHELL_SET: 'file' },
    { A: 'local', B: 'local' },
  ]);
  assert.deepEqual(merged, { A: 'local', B: 'local' });
});

test('median and nearest-rank p95', () => {
  assert.equal(median([]), null);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([1, null, NaN, 3]), 2);
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(hundred, 95), 95);
  assert.equal(percentile([10, 20, 30], 95), 30);
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([], 95), null);
});

test('missingModels treats :latest as equal to the bare name', () => {
  assert.deepEqual(
    missingModels(['bge-m3:latest', 'qwen2.5:14b-instruct-q4_K_M'], ['bge-m3', 'qwen2.5:14b-instruct-q4_K_M']),
    []
  );
  assert.deepEqual(missingModels(['bge-m3'], ['bge-m3:latest', 'qwen2.5:14b']), ['qwen2.5:14b']);
});

test('summarizePs totals size_vram across loaded models', () => {
  const s = summarizePs({
    models: [
      { name: 'qwen', size: 10, size_vram: 9, context_length: 8192 },
      { name: 'bge', size: 2, size_vram: 2 },
    ],
  });
  assert.equal(s.totalVram, 11);
  assert.deepEqual(s.models.qwen, { size: 10, size_vram: 9, context_length: 8192 });
  assert.deepEqual(summarizePs({ models: [] }), { totalVram: 0, models: {} });
  assert.deepEqual(summarizePs(null), { totalVram: 0, models: {} });
});

test('foldPsPeak keeps the peak total and per-model maxima across samples', () => {
  let peak = foldPsPeak(null, { models: [{ name: 'qwen', size: 10, size_vram: 10 }] });
  peak = foldPsPeak(peak, { models: [{ name: 'qwen', size: 10, size_vram: 8 }, { name: 'bge', size: 2, size_vram: 2 }] });
  peak = foldPsPeak(peak, { models: [] });
  assert.equal(peak.samples, 3);
  assert.equal(peak.peak_total_vram_bytes, 10);
  assert.deepEqual(peak.models, { qwen: { size: 10, size_vram: 10 }, bge: { size: 2, size_vram: 2 } });
});

test('nvidia-smi parsing', () => {
  assert.equal(parseNvidiaMemoryUsed('1234\n'), 1234);
  assert.equal(parseNvidiaMemoryUsed('100\r\n200\r\n'), 300);
  assert.equal(parseNvidiaMemoryUsed(''), null);
  assert.deepEqual(parseNvidiaGpus('NVIDIA GeForce RTX 4080, 16376 MiB, 560.94\n'), [
    { name: 'NVIDIA GeForce RTX 4080', memory_total: '16376 MiB', driver_version: '560.94' },
  ]);
});

test('summarizeUsage computes the benchmark stats (NUMERIC arrives as strings)', () => {
  const rows = [
    { latency_ms: 1000, load_ms: 5000, eval_tokens_per_sec: '20.50', retrieval_ms: 40, model: 'qwen' },
    { latency_ms: 2000, load_ms: 0, eval_tokens_per_sec: '30.50', retrieval_ms: 60, model: 'qwen' },
    { latency_ms: 3000, load_ms: 999, eval_tokens_per_sec: '25.00', retrieval_ms: 50, model: 'qwen' },
  ];
  assert.deepEqual(summarizeUsage(rows), {
    calls: 3,
    latency_ms_median: 2000,
    latency_ms_p95: 3000,
    eval_tokens_per_sec_median: 25,
    load_ms_max: 5000,
    cold_loads: 1,
    retrieval_ms_median: 50,
    models: ['qwen'],
  });
  assert.equal(summarizeUsage([]).load_ms_max, null);
});

test('parityDiff compares median_native for answers present in both files', () => {
  const file = recs => ({ subjects: { geo: { records: recs } } });
  const ref = file([
    { student_code: 'G1', median_native: 4 },
    { student_code: 'G2', median_native: 3 },
    { student_code: 'G3', median_native: 2 },
    { student_code: 'G4', median_native: null },
  ]);
  const got = file([
    { student_code: 'G1', median_native: 4 },
    { student_code: 'G2', median_native: 5 },
    { student_code: 'G4', median_native: 1 },
    { student_code: 'G9', median_native: 1 },
  ]);
  const p = parityDiff(ref, got);
  assert.equal(p.compared, 3);
  assert.equal(p.identical, 1);
  assert.equal(p.differing, 2);
  assert.deepEqual(p.differences, [
    { subject: 'geo', student_code: 'G2', reference: 3, bench: 5, delta: 2 },
    { subject: 'geo', student_code: 'G4', reference: null, bench: 1, delta: null },
  ]);
  assert.deepEqual(p.only_in_reference, ['geo/G3']);
  assert.deepEqual(p.only_in_bench, ['geo/G9']);
});

test('parseArgs defaults and overrides', () => {
  assert.deepEqual(parseArgs([]), { set: 'final', runs: 1, reference: null, outDir: null, dryRun: false });
  const a = parseArgs(['--set=both', '--runs=3', '--reference=a=b.json', '--out-dir=x', '--dry-run']);
  assert.deepEqual(a, { set: 'both', runs: 3, reference: 'a=b.json', outDir: 'x', dryRun: true });
});

test('timestampSlug and sanitizeHost are filesystem-safe', () => {
  assert.equal(timestampSlug(new Date(2026, 0, 2, 3, 4, 5)), '20260102-030405');
  assert.equal(sanitizeHost('RTX PC:1/a'), 'RTX_PC_1_a');
});

test('pgSsl mirrors lib/pg-ssl.ts explicit values', () => {
  assert.equal(pgSsl({ POSTGRES_SSL: 'false' }), false);
  assert.deepEqual(pgSsl({ POSTGRES_SSL: 'require' }), { rejectUnauthorized: false });
  assert.equal(pgSsl({}), undefined);
});

test('describeDbUrl never includes credentials', () => {
  const d = describeDbUrl('postgresql://user:s3cret@db.local:5433/aux');
  assert.equal(d, 'db.local:5433/aux');
  assert.ok(!d.includes('s3cret'));
  assert.equal(describeDbUrl(undefined), 'not set');
});

test('renderSummary lists differences', () => {
  const md = renderSummary({
    started_at: 'a',
    finished_at: 'b',
    plan: { set: 'final', runs: 1, reference: 'ref.json' },
    environment: { hostname: 'h', gpus: null, node: 'v22', os: 'Linux' },
    harness: { exit_code: 0 },
    usage: summarizeUsage([]),
    vram: { peak_total_vram_bytes: 2 * 1024 ** 3, models: {} },
    nvidia: null,
    parity: { identical: 1, compared: 2, differences: [{ subject: 'geo', student_code: 'G2', reference: 3, bench: 5, delta: 2 }] },
  });
  assert.match(md, /\| Peak Ollama size_vram total \(GiB\) \| 2\.00 \|/);
  assert.match(md, /\| geo\/G2 \| 3 \| 5 \| 2 \|/);
  assert.match(md, /identical \/ compared\) \| 1 \/ 2 \|/);
});
