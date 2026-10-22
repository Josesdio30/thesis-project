#!/usr/bin/env node
/**
 * Creates the v3 study setups: clones of the frozen validation assignments
 * 5/6/7 under ids "5-v3"/"6-v3"/"7-v3", for BOTH providers, so OpenAI and the
 * local model get identical treatment and the frozen v1.4 / local-v2 rows are
 * never touched.
 *
 * Each clone keeps the original course and grounding (same OpenAI vector store,
 * same local RAG corpus). Only the rubric changes:
 *   - max_score is the native maximum (5 / 15), so the model scores natively
 *   - scoring_guide is the scoring section of the written guide, verbatim, minus
 *     any section written to calibrate towards one teacher
 *   - anchors are calibration answers both teachers scored, shown with the
 *     average of the two teachers' scores
 *
 * Anchor rule (pre-registered before any v3 run): per subject, 2-3 calibration
 * answers spanning low/mid/high consensus, where both teachers scored the
 * answer and differ by at most 1 point. Anchor answers are excluded from
 * calibration scoring; the 72 held-out answers are never used.
 *
 *   node scripts/validation/setup-v3.mjs            create or update the clones
 *   node scripts/validation/setup-v3.mjs --dry-run  print the rubrics only
 *
 * Writes docs/validation/automated-grading/v3/{v3-ids.json,rubrics.json}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadProjectEnv } from '../lib/load-env.cjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const AG = path.join(ROOT, 'docs/validation/automated-grading');
const OUT_DIR = path.join(AG, 'v3');
const DRY_RUN = process.argv.includes('--dry-run');

const ANCHORS = {
  geografi: ['GEO-S12', 'GEO-S23', 'GEO-S01'],
  biologi: ['BIO-S02', 'BIO-S07'],
  agama: ['AGM-S11', 'AGM-S18', 'AGM-S01'],
};


/** Scoring sections of a guide: headings mentioning PENILAIAN/ATURAN, never calibration notes. */
function scoringGuide(text) {
  const out = [];
  let keep = false;
  for (const line of text.split('\n')) {
    const heading = /^[A-Z][A-Z0-9 ()—\-–,/&]{6,}/.test(line.trim());
    // The file title ("MATERI ACUAN PENILAIAN") also says PENILAIAN but is not a scoring section.
    if (heading) keep = /PENILAIAN|ATURAN/.test(line) && !/kalibrasi/i.test(line) && !/^MATERI/.test(line.trim());
    if (keep) out.push(line);
  }
  return out.join('\n').trim();
}

function buildRubrics() {
  const dataset = JSON.parse(fs.readFileSync(path.join(AG, 'dataset.json'), 'utf8')).subjects;
  const t2 = JSON.parse(fs.readFileSync(path.join(AG, 'second-rater/scores.json'), 'utf8')).subjects;
  const ids = JSON.parse(fs.readFileSync(path.join(AG, 'ingest-ids.json'), 'utf8'));
  const rubrics = {};

  for (const sid of ids.subjects) {
    const s = dataset[sid.subj];
    const byCode = Object.fromEntries(s.answers.map(a => [a.student_code, a]));
    const anchors = ANCHORS[sid.subj].map(code => {
      const a = byCode[code];
      const second = t2[sid.subj].scores[code];
      if (a.set !== 'calib') throw new Error(`${code} is not a calibration answer`);
      if (second == null || Math.abs(second - a.score_teacher) > 1) throw new Error(`${code} breaks the anchor rule`);
      return { student_code: code, answer: a.answer_text, score: (a.score_teacher + second) / 2 };
    });
    const guide = scoringGuide(fs.readFileSync(path.join(ROOT, 'public', s.grounding_file), 'utf8'));
    if (!guide) throw new Error(`no scoring section found for ${sid.subj}`);

    rubrics[sid.subj] = {
      questionId: sid.questionId,
      max_score: s.max_score,
      criteria: s.criteria,
      qualitative_scale: ['Excellent', 'Good', 'Fair', 'Poor'],
      scoring_guide: guide,
      anchors: anchors.map(({ answer, score }) => ({ answer, score })),
      _anchor_codes: anchors.map(a => a.student_code),
    };
  }
  return { ids, rubrics };
}

async function main() {
  loadProjectEnv();
  const { ids, rubrics } = buildRubrics();
  const v3Ids = { ...ids, subjects: ids.subjects.map(s => ({ ...s, assignmentId: `${s.assignmentId}-v3` })) };

  if (DRY_RUN) {
    console.log(JSON.stringify(rubrics, null, 2));
    return;
  }

  const client = new pg.Client({ connectionString: process.env.AUX_POSTGRES_URL });
  await client.connect();
  try {
    for (const s of ids.subjects) {
      const { _anchor_codes, ...rubric } = rubrics[s.subj];
      const source = String(s.assignmentId);
      const clone = `${s.assignmentId}-v3`;
      const rubricJson = JSON.stringify([rubric]);

      const openai = await client.query(
        `INSERT INTO acs_assignments (assignment_id, course_id, vector_store_id, rubric, created_by, status)
         SELECT $2, course_id, vector_store_id, $3::jsonb, created_by, 'setup' FROM acs_assignments WHERE assignment_id = $1
         ON CONFLICT (assignment_id) DO UPDATE SET rubric = EXCLUDED.rubric, updated_at = NOW()
         RETURNING assignment_id, vector_store_id`,
        [source, clone, rubricJson]
      );
      const local = await client.query(
        `INSERT INTO acs_local_assignments (assignment_id, course_id, corpus_id, rubric, created_by, status)
         SELECT $2, course_id, corpus_id, $3::jsonb, created_by, 'setup' FROM acs_local_assignments WHERE assignment_id = $1
         ON CONFLICT (assignment_id) DO UPDATE SET rubric = EXCLUDED.rubric, updated_at = NOW()
         RETURNING assignment_id, corpus_id`,
        [source, clone, rubricJson]
      );
      if (!openai.rowCount || !local.rowCount) throw new Error(`source setup ${source} missing for one provider`);
      console.error(`  ✓ ${clone}: openai ${openai.rows[0].vector_store_id.slice(0, 12)}…  local corpus ${local.rows[0].corpus_id.slice(0, 8)}…  anchors ${_anchor_codes.join(', ')}`);
    }
  } finally {
    await client.end();
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'v3-ids.json'), JSON.stringify(v3Ids, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'rubrics.json'), JSON.stringify(rubrics, null, 2));
  console.error(`wrote ${path.relative(ROOT, OUT_DIR)}/v3-ids.json and rubrics.json`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
