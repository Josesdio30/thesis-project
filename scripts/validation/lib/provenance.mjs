/**
 * Shared provenance guards for the validation harness.
 *
 * The whole comparison rests on one claim: the local arm and the OpenAI arm saw
 * exactly the same inputs. Asserting the dataset digest before a run is the
 * cheapest way to keep that claim honest — an accidental re-run of
 * build-dataset.py would otherwise silently produce numbers that look
 * comparable and are not.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Digests of the frozen datasets, recorded 2026-08-22.
 *
 * If a dataset is legitimately regenerated, update the digest here IN THE SAME
 * COMMIT as the new dataset and re-run BOTH arms. Never silence the check to
 * get a run to start.
 */
export const FROZEN_DIGESTS = Object.freeze({
  'automated-grading': '9d2c840e84d32799e6a25adecfcdc99ed16e9936ef170699976445264774cbb4',
  plagiarism: '4038ab242405917e5977acc9f2e03095946a4c8a50f4dc47be91b6cda5d86b40',
});

export function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Aborts unless `datasetPath` still matches its frozen digest.
 * Set VALIDATION_ALLOW_DATASET_DRIFT=1 only for a deliberate re-freeze.
 */
export function assertDatasetDigest(feature, datasetPath) {
  const expected = FROZEN_DIGESTS[feature];
  if (!expected) throw new Error(`No frozen digest recorded for feature "${feature}"`);

  const actual = sha256File(datasetPath);
  if (actual === expected) {
    console.error(`  ✓ dataset digest ${actual.slice(0, 12)}… matches the frozen ${feature} set`);
    return actual;
  }

  if (process.env.VALIDATION_ALLOW_DATASET_DRIFT === '1') {
    console.error(`  ! DATASET DRIFT ALLOWED — expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…`);
    console.error('  ! Results from this run are NOT comparable to the frozen baseline.');
    return actual;
  }

  throw new Error(
    `Dataset digest mismatch for ${feature}.\n` +
      `  expected: ${expected}\n  actual:   ${actual}\n  file:     ${datasetPath}\n` +
      `The frozen baseline was computed from a different file, so any comparison would be invalid.\n` +
      `Restore the dataset, or re-freeze deliberately and re-run BOTH provider arms.`
  );
}

/**
 * Which physical plagiarism tables to read. Mirrors `pdsTables()` in the app:
 * the server decides where it WRITES via AI_PROVIDER, and the harness has to
 * read the matching tables.
 */
export function pdsTablePrefix() {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  const explicit = process.env.PDS_TABLE_PREFIX;
  if (explicit) return explicit.replace(/_$/, '') + '_';
  if (provider === 'local') return 'pds_local_';
  if (provider === 'openai') return 'pds_';
  throw new Error(`Invalid AI_PROVIDER "${process.env.AI_PROVIDER}" (expected "openai" or "local")`);
}

/**
 * Results directory for the active provider. The local arm writes to
 * `results/local/` so the frozen OpenAI artefacts are never overwritten —
 * they are the baseline the local numbers are compared against.
 */
export function resultsDir(root, feature) {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  const base = path.join(root, 'docs/validation', feature, 'results');
  const dir = process.env.VALIDATION_RESULTS_DIR || (provider === 'local' ? path.join(base, 'local') : base);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Banner so every run log states which arm produced it. */
export function announceRun(feature) {
  const provider = (process.env.AI_PROVIDER || 'openai').trim().toLowerCase();
  console.error(`\n── validation run: feature=${feature} AI_PROVIDER=${provider} ──`);
  return provider;
}

/**
 * Reads a required credential from the environment.
 *
 * These scripts used to carry a real password as a literal default. That is a
 * working credential for the validation accounts on this LMS, and it must not
 * live in the repository. Failing loudly is also better behaviour: a silent
 * fallback to the wrong password produced a login error 20 lines later, with
 * nothing pointing at the cause.
 */
export function requiredEnv(name, hint = '') {
  const value = process.env[name];
  if (value && value.trim()) return value;
  throw new Error(
    `Missing ${name}.${hint ? ' ' + hint : ''}\n` +
      `  Pass it explicitly, e.g.  ${name}='…' node scripts/validation/<script>.mjs`
  );
}
