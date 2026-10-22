#!/usr/bin/env node
/**
 * Reads the returned second-teacher workbook and writes scores.json.
 *
 *   node scripts/validation/ingest-second-rater.mjs [path/to/returned.xlsx]
 *     default input: docs/validation/automated-grading/second-rater/lembar-penilaian-guru-2.xlsx
 *     -> docs/validation/automated-grading/second-rater/scores.json
 *
 * Fails loudly on anything that would corrupt an agreement statistic: a code
 * that is not in the manifest, a duplicated code, or a score that is not an
 * integer within [0, max]. Blank Part B rows are allowed; blank Part A rows
 * are reported, because every local-v2 metric is computed on Part A.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'docs/validation/automated-grading/second-rater');
const input = process.argv[2] ?? path.join(DIR, 'lembar-penilaian-guru-2.xlsx');

const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const out = { source: path.relative(ROOT, input), ingested_at: new Date().toISOString(), subjects: {} };
const problems = [];

/** Plain value of a cell: unwraps rich text, hyperlinks and formula results; empty cells become ''. */
function cellValue(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v !== 'object' || v instanceof Date) return v;
  if (v.richText) return v.richText.map(part => part.text).join('');
  if ('result' in v) return v.result ?? '';
  return v.text ?? '';
}

for (const [subj, m] of Object.entries(manifest.subjects)) {
  const ws = wb.getWorksheet(m.sheet);
  if (!ws) throw new Error(`Sheet "${m.sheet}" not found in ${input}`);
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    if (n > 3) rows.push([1, 2, 3, 4, 5, 6].map(c => cellValue(row.getCell(c))));
  });
  const expected = new Set([...m.part_a, ...m.part_b]);
  const scores = {};
  const notes = {};

  for (const row of rows) {
    const [, , code, , rawScore, note] = row;
    if (!code) continue;
    if (!expected.has(code)) problems.push(`${subj}: unknown code ${code}`);
    if (code in scores) problems.push(`${subj}: duplicated code ${code}`);
    if (rawScore === '') {
      scores[code] = null;
      continue;
    }
    const score = Number(rawScore);
    if (!Number.isInteger(score) || score < 0 || score > m.max_score) {
      problems.push(`${subj}: ${code} has invalid score "${rawScore}" (expected an integer 0-${m.max_score})`);
      continue;
    }
    scores[code] = score;
    if (note) notes[code] = String(note);
  }

  const missingA = m.part_a.filter(code => scores[code] == null);
  if (missingA.length) problems.push(`${subj}: Part A not scored for ${missingA.join(', ')}`);
  out.subjects[subj] = { max_score: m.max_score, scores, notes };
}

if (problems.some(p => !p.includes('Part A not scored'))) {
  console.error('Refusing to write scores.json:\n  ' + problems.join('\n  '));
  process.exit(1);
}
fs.writeFileSync(path.join(DIR, 'scores.json'), JSON.stringify(out, null, 2));
console.error(`wrote ${path.relative(ROOT, path.join(DIR, 'scores.json'))}`);
if (problems.length) console.error('Warnings:\n  ' + problems.join('\n  '));
