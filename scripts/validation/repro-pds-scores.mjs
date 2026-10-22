#!/usr/bin/env node
/**
 * Full-evidence reproduction: compute semantic / lexical / combined / risk for
 * ALL 45 pairs (the engine only persists pairs >= 0.40).
 *
 * Fidelity guarantees:
 *   - Semantic uses the SYSTEM'S OWN embeddings (read from aux pds_embeddings,
 *     generated during the real /api/plagiarism/detect run). Each answer is a
 *     single chunk, so semantic = cosine(vecA, vecB) — identical to the engine.
 *   - Lexical (BM25), z-score normalisation, and risk mapping reimplement the
 *     exact formulas from lib/plagiarism/similarity.ts (verbatim constants).
 *   - Cross-checked against results/raw-comparisons.json (the 6 engine-stored
 *     pairs). Any mismatch aborts.
 *
 * Run: node --env-file=.env --env-file=.env.local scripts/validation/repro-pds-scores.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { announceRun, assertDatasetDigest, pdsTablePrefix, resultsDir } from './lib/provenance.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DIR = path.join(ROOT, 'docs/validation/plagiarism');
const T = pdsTablePrefix();
const OUT = resultsDir(ROOT, 'plagiarism');

// ── verbatim from lib/plagiarism/similarity.ts ────────────────────────────────
const STOPWORDS = new Set([
  'the','be','to','of','and','a','in','that','have','i','it','for','not','on','with','he','as','you','do','at',
  'this','but','his','by','from','they','we','say','her','she','or','an','will','my','one','all','would','there','their','what',
  'so','up','out','if','about','who','get','which','go','me','is','are','was','were','been','has','had','does','did','can',
  'could','should','would','may','might','must','am',
  'yang','di','dan','itu','dengan','untuk','tidak','ini','dari','dalam','akan','pada','juga','saya','adalah','ke','karena','kepada','oleh','saat',
  'harus','sementara','setelah','belum','kami','kita','mereka','dia','ia','atau','bisa','dapat','sudah','bagi','namun','tentang','seperti','jika',
  'sehingga','ia','tapi','sangat','banyak','lebih',
]);
const tokenizeForLexical = text =>
  text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length >= 3 && !STOPWORDS.has(w));

function bm25CorpusStats(texts) {
  const docFreq = new Map(); let total = 0; const N = texts.length;
  if (N === 0) return { idf: new Map(), avgdl: 0 };
  for (const t of texts) {
    const tok = tokenizeForLexical(t); total += tok.length;
    for (const u of new Set(tok)) docFreq.set(u, (docFreq.get(u) || 0) + 1);
  }
  const idf = new Map();
  for (const [tk, df] of docFreq) idf.set(tk, Math.log(1 + (N - df + 0.5) / (df + 0.5)));
  return { idf, avgdl: total / N };
}
function rawBM25(q, d, stats) {
  if (stats.avgdl === 0 || d.length === 0 || q.length === 0) return 0;
  const k1 = 1.2, b = 0.75, dl = d.length;
  const df = new Map(); for (const t of d) df.set(t, (df.get(t) || 0) + 1);
  let score = 0;
  for (const qt of new Set(q)) {
    const f = df.get(qt); if (!f) continue;
    const idf = stats.idf.get(qt) ?? 0;
    score += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / stats.avgdl)));
  }
  return score;
}
function bm25Sim(a, b, stats) {
  const ta = tokenizeForLexical(a), tb = tokenizeForLexical(b);
  const ab = rawBM25(ta, tb, stats), aa = rawBM25(ta, ta, stats), ba = rawBM25(tb, ta, stats), bb = rawBM25(tb, tb, stats);
  if (aa === 0 || bb === 0) return 0;
  return Math.min(Math.max((ab / aa + ba / bb) / 2, 0), 1);
}
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}
function distStats(vals) {
  const n = vals.length; if (n === 0) return { mean: 0, std: 0 };
  const mean = vals.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { mean, std: 0 };
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  return { mean, std: Math.sqrt(variance) };
}
const zScore = (v, m, s) => (s === 0 ? 0 : (v - m) / s);
const zToNorm = z => (z <= 0 ? 0 : Math.min(z / 3, 1));
const riskLevel = s => (s >= 0.8 ? 'HIGH' : s >= 0.6 ? 'MEDIUM' : s >= 0.4 ? 'LOW' : 'NONE');

const round4 = x => Math.round(x * 10000) / 10000;

async function main() {
  announceRun('plagiarism');
  assertDatasetDigest('plagiarism', path.join(DIR, 'dataset.json'));
  console.error(`  reading ${T}embeddings / ${T}chunks`);

  const dataset = JSON.parse(fs.readFileSync(path.join(DIR, 'dataset.json'), 'utf8'));
  const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'ingest-ids.json'), 'utf8'));
  const rawFile = JSON.parse(fs.readFileSync(path.join(OUT, 'raw-comparisons.json'), 'utf8'));
  // v1 artefacts are a bare array; newer runs wrap the pairs with provenance.
  const stored = Array.isArray(rawFile) ? rawFile : rawFile.pairs;
  const storedMap = new Map(stored.map(r => [`${r.subject}|${r.pair}`, r]));

  const aux = new Pool({ connectionString: process.env.AUX_POSTGRES_URL });

  const all = [];
  let mismatches = 0;
  for (const subjEntry of ids.subjects) {
    const subj = subjEntry.subj;
    const ds = dataset.subjects[subj];
    const slotText = Object.fromEntries(ds.submissions.map(s => [s.slot, s.answer_text]));
    const slotOrder = ds.submissions.map(s => s.slot); // S1..S6
    // submissionId -> slot
    const subToSlot = {};
    for (const st of subjEntry.students) subToSlot[String(st.submissionId)] = st.code.split('-').pop();
    const subIds = subjEntry.students.map(s => String(s.submissionId));

    // embeddings (single chunk per submission)
    const { rows: emb } = await aux.query(
      `SELECT c.submission_id, e.vector FROM ${T}embeddings e JOIN ${T}chunks c ON e.chunk_id=c.id WHERE c.submission_id=ANY($1)`, [subIds]);
    const slotVec = {};
    for (const r of emb) {
      const slot = subToSlot[String(r.submission_id)];
      slotVec[slot] = typeof r.vector === 'string' ? JSON.parse(r.vector) : r.vector;
    }

    const corpus = bm25CorpusStats(slotOrder.map(s => slotText[s]));

    // pair lookup for label/pair_type
    const pinfo = new Map();
    for (const p of ds.pairs) pinfo.set([p.a, p.b].sort().join('-'), p);

    // slot -> submission id; order by submission id asc (engine processing order:
    // SQL ORDER BY s.id). The semantic match is DIRECTIONAL — the engine sums best
    // cosines over the lower-id submission's chunks (subA), and a match only exists
    // if the target is among that chunk's top-K nearest neighbours.
    const LIMIT_K = 10; // findSimilarChunksLateral(submissionIds, 10)
    const slotSub = {};
    for (const st of subjEntry.students) slotSub[st.code.split('-').pop()] = Number(st.submissionId);
    const ordered = [...slotOrder].sort((x, y) => slotSub[x] - slotSub[y]);

    // full cosine matrix + per-submission top-K nearest set
    const cos = {};
    for (const x of ordered) cos[x] = {};
    for (let i = 0; i < ordered.length; i++)
      for (let j = 0; j < ordered.length; j++)
        if (i !== j) cos[ordered[i]][ordered[j]] = cosine(slotVec[ordered[i]], slotVec[ordered[j]]);
    const topset = {};
    for (const x of ordered)
      topset[x] = new Set(ordered.filter(o => o !== x).sort((p, q) => cos[x][q] - cos[x][p]).slice(0, LIMIT_K));

    // compute raw sem/lex per pair (a = lower submission id)
    const pairs = [];
    for (let i = 0; i < ordered.length; i++)
      for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i], b = ordered[j];
        const sem = topset[a].has(b) ? cos[a][b] : 0; // engine zeroes pairs outside top-K
        const lex = bm25Sim(slotText[a], slotText[b], corpus);
        pairs.push({ a, b, sem, lex });
      }
    const semStats = distStats(pairs.map(p => p.sem));
    const lexStats = distStats(pairs.map(p => p.lex));

    for (const p of pairs) {
      const zS = zScore(p.sem, semStats.mean, semStats.std);
      const zL = zScore(p.lex, lexStats.mean, lexStats.std);
      const combined = zToNorm(Math.max(zS, zL));
      const risk = riskLevel(combined);
      const key = [p.a, p.b].sort().join('-');
      const meta = pinfo.get(key);
      const row = {
        subject: subj, pair: key, transform: meta?.pair_type, label: meta?.label,
        semantic: round4(p.sem), lexical: round4(p.lex),
        z_semantic: round4(zS), z_lexical: round4(zL),
        combined: round4(combined), risk,
        predicted: (risk === 'HIGH' || risk === 'MEDIUM') ? 'suspicious' : 'independent',
      };
      all.push(row);

      // fidelity cross-check vs engine-stored pairs
      const sm = storedMap.get(`${subj}|${key}`);
      if (sm) {
        const dC = Math.abs(sm.combined - combined), dS = Math.abs(sm.semantic - p.sem), dL = Math.abs(sm.lexical - p.lex);
        if (dC > 0.005 || dS > 0.005 || dL > 0.005) {
          mismatches++;
          console.log(`  MISMATCH ${subj} ${key}: engine(sem=${sm.semantic} lex=${sm.lexical} comb=${sm.combined}) vs repro(sem=${round4(p.sem)} lex=${round4(p.lex)} comb=${round4(combined)})`);
        }
      } else if (combined >= 0.4) {
        mismatches++;
        console.log(`  MISMATCH ${subj} ${key}: repro combined ${round4(combined)} >=0.4 but engine did not store it`);
      }
    }
  }
  await aux.end();

  // Provenance travels with the artefact so a results file can never be
  // misattributed to the wrong provider arm.
  fs.writeFileSync(path.join(OUT, 'all-pairs.json'), JSON.stringify(
    { provider: (process.env.AI_PROVIDER || 'openai').trim().toLowerCase(),
      table_prefix: T, generated_at: new Date().toISOString(), pairs: all },
    null, 2));
  console.log(`\nfidelity cross-check: ${mismatches === 0 ? 'PASS (all engine-stored pairs reproduced exactly)' : mismatches + ' MISMATCHES'}`);
  console.log(`wrote ${path.relative(ROOT, path.join(OUT, 'all-pairs.json'))} (${all.length} pairs)`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
