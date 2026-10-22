#!/usr/bin/env node
/**
 * Builds the blind scoring workbook for a second teacher (inter-rater study).
 *
 * The sheet contains the question, the written grading guide and each answer —
 * never teacher 1's score, the calibration/final split, or anything else that
 * could anchor the second rater. Rows are shuffled with a fixed seed because the
 * dataset split is stratified by teacher 1's score, so its natural order leaks
 * information.
 *
 *   node scripts/validation/build-second-rater-sheet.mjs
 *     -> docs/validation/automated-grading/second-rater/lembar-penilaian-guru-2.xlsx
 *     -> docs/validation/automated-grading/second-rater/manifest.json
 *
 * Part A (wajib) = the 45 grading answers (calib + final), the set every local-v2
 * metric is computed on. Part B (opsional) = the 45 pool answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { assertDatasetDigest, sha256File } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DATASET = path.join(ROOT, 'docs/validation/automated-grading/dataset.json');
const OUT_DIR = path.join(ROOT, 'docs/validation/automated-grading/second-rater');
const SEED = 20261016;

const SUBJECT_LABELS = { geografi: 'Geografi', biologi: 'Biologi', agama: 'Agama' };

/**
 * The grounding files carry sections written to calibrate the AI towards
 * teacher 1's leniency (agama: "CATATAN PENILAIAN (… kalibrasi terhadap standar
 * guru)"). Showing those to teacher 2 would anchor them to teacher 1 and inflate
 * the very agreement being measured, so any section whose heading mentions
 * calibration is dropped, up to the next all-caps heading.
 */
function stripCalibrationSections(text) {
  const lines = text.split('\n');
  const kept = [];
  const removed = [];
  let skipping = false;
  for (const line of lines) {
    const isHeading = /^[A-Z][A-Z0-9 ()—\-–,/&]{6,}/.test(line.trim());
    if (isHeading) skipping = /kalibrasi/i.test(line);
    (skipping ? removed : kept).push(line);
  }
  return { text: kept.join('\n').trimEnd(), removed };
}

/** mulberry32 — tiny deterministic PRNG so the row order is reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const INSTRUCTIONS = [
  ['LEMBAR PENILAIAN GURU KEDUA — VALIDASI PENILAIAN OTOMATIS (AI)'],
  [''],
  ['Tujuan'],
  ['Lembar ini dipakai untuk mengukur seberapa sepakat dua guru dalam menilai jawaban yang sama.'],
  ['Hasilnya menjadi batas atas yang wajar untuk menilai kinerja AI: AI tidak dapat diharapkan lebih konsisten daripada dua guru.'],
  [''],
  ['Cara mengisi'],
  ['1. Buka sheet per mata pelajaran (Geografi, Biologi, Agama). Soal dan pedoman penilaian ada di sheet "Pedoman ...".'],
  ['2. Baca setiap jawaban lalu isi kolom "Skor" dengan bilangan bulat dari 0 sampai skor maksimal yang tertera.'],
  ['3. Nilailah seperti Anda menilai tugas siswa sehari-hari, menggunakan pedoman yang sama.'],
  ['4. Kolom "Catatan" boleh diisi singkat (opsional), misalnya alasan pengurangan poin.'],
  ['5. Bagian A wajib diisi (45 jawaban). Bagian B opsional (45 jawaban tambahan) bila waktu memungkinkan.'],
  [''],
  ['Penting'],
  ['- Mohon menilai secara mandiri: jangan melihat nilai guru lain, nilai AI, atau berdiskusi tentang jawaban tertentu sebelum selesai.'],
  ['- Ejaan dan spasi yang aneh di dalam kata (misalnya "kehid upan") berasal dari salinan PDF, bukan kesalahan siswa. Abaikan.'],
  ['- Kode siswa hanya penanda baris; tidak mengandung informasi nilai.'],
  ['- Urutan jawaban sengaja diacak.'],
  [''],
  ['Setelah selesai, kirimkan kembali file ini tanpa mengubah kolom "Kode".'],
];

/** Append a worksheet of array-of-arrays rows (empty strings become blank cells) with the given column widths (in characters). */
function addSheet(wb, name, rows, widths) {
  const ws = wb.addWorksheet(name);
  ws.addRows(rows.map(row => row.map(value => (value === '' ? null : value))));
  widths.forEach((width, i) => { ws.getColumn(i + 1).width = width; });
}

async function main() {
  assertDatasetDigest('automated-grading', DATASET);
  const dataset = JSON.parse(fs.readFileSync(DATASET, 'utf8')).subjects;
  const random = rng(SEED);
  const wb = new ExcelJS.Workbook();

  addSheet(wb, 'Petunjuk', INSTRUCTIONS, [130]);

  const manifest = { generated_at: new Date().toISOString(), seed: SEED, dataset_sha256: sha256File(DATASET), subjects: {} };

  for (const [subj, s] of Object.entries(dataset)) {
    const label = SUBJECT_LABELS[subj] ?? subj;
    const guidePath = path.join(ROOT, 'public', s.grounding_file);
    const { text: guide, removed } = stripCalibrationSections(fs.readFileSync(guidePath, 'utf8'));

    addSheet(wb, `Pedoman ${label}`, [
      [`Pedoman penilaian — ${label} (skor maksimal ${s.max_score})`],
      [''],
      ...guide.split('\n').map(line => [line]),
    ], [110]);

    const partA = shuffle(s.answers.filter(a => a.set === 'calib' || a.set === 'final'), random);
    const partB = shuffle(s.answers.filter(a => a.set === 'pool'), random);
    const rows = [
      ...partA.map(a => ({ part: 'A (wajib)', a })),
      ...partB.map(a => ({ part: 'B (opsional)', a })),
    ];

    const header = ['No', 'Bagian', 'Kode', 'Jawaban siswa', `Skor (0-${s.max_score})`, 'Catatan'];
    addSheet(wb, label, [
      [`${label} — Soal: ${s.question_text}`],
      [''],
      header,
      ...rows.map((r, i) => [i + 1, r.part, r.a.student_code, r.a.answer_text, '', '']),
    ], [5, 13, 10, 100, 12, 40]);

    manifest.subjects[subj] = {
      max_score: s.max_score,
      sheet: label,
      guide_lines_removed: removed,
      part_a: partA.map(a => a.student_code),
      part_b: partB.map(a => a.student_code),
    };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, 'lembar-penilaian-guru-2.xlsx');
  await wb.xlsx.writeFile(outFile);
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.error(`wrote ${path.relative(ROOT, outFile)} and manifest.json`);
}

await main();
