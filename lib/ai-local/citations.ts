import type { RetrievedPassage } from '@/lib/ai/types';

/**
 * Turns the labels a model emitted into citations that are guaranteed to point
 * at material actually placed in its prompt.
 *
 * The OpenAI path takes the model's citation strings at face value, so a
 * confidently invented source reaches the teacher unchallenged. Here every
 * label is cross-checked against what retrieval returned, and anything else is
 * dropped. The output format is unchanged — `citations: string[]` — so no
 * frontend code is affected.
 */

/** Matches `M3`, `[M3]`, `(M3)`, and labels embedded in a longer sentence. */
const LABEL_PATTERN = /\bM(\d+)\b/g;

function formatCitation(passage: RetrievedPassage): string {
  const name = passage.documentName.trim().replace(/\s+/g, '_');
  const locator = passage.locator.trim();

  const page = /^p\.\s*(\d+)$/i.exec(locator);
  if (page) return `[${name}_page_${page[1]}]`;

  const slide = /^slide\s*(\d+)$/i.exec(locator);
  if (slide) return `[${name}_slide_${slide[1]}]`;

  return `[${name}]`;
}

/**
 * @param emitted   whatever the model put in `citations`
 * @param passages  the passages actually retrieved for this call
 * @returns citations in the same `[source_page_n]` form the frozen prompt asks
 *          for, deduplicated and ordered by the passage ranking
 */
export function resolveCitations(
  emitted: string[] | undefined | null,
  passages: RetrievedPassage[]
): string[] {
  if (!Array.isArray(emitted) || passages.length === 0) return [];

  const byLabel = new Map(passages.map(p => [p.label.toUpperCase(), p]));
  const matched = new Set<string>();

  for (const entry of emitted) {
    if (typeof entry !== 'string') continue;
    for (const match of entry.toUpperCase().matchAll(LABEL_PATTERN)) {
      const label = `M${Number(match[1])}`;
      if (byLabel.has(label)) matched.add(label);
    }
  }

  // Ordered by retrieval rank rather than by the order the model listed them,
  // so the strongest supporting passage is cited first.
  //
  // Deduplicated on the FORMATTED string, not on the label: several retrieved
  // chunks routinely share one locator — every chunk of a .txt resolves to the
  // same `[file]`, and two chunks from one PDF page to the same `[file_page_n]`.
  // Deduplicating labels alone emitted the identical citation four times.
  const seen = new Set<string>();
  const citations: string[] = [];
  for (const passage of passages) {
    if (!matched.has(passage.label.toUpperCase())) continue;
    const citation = formatCitation(passage);
    if (seen.has(citation)) continue;
    seen.add(citation);
    citations.push(citation);
  }
  return citations;
}

/**
 * The grounding block appended after the frozen system prompt.
 *
 * `prompts/grading-system-prompt.txt` is deliberately not edited — it is the
 * config-v1.4 provenance record and its text also lives in `ai_config`. This
 * block supersedes the two instructions that assume OpenAI: rule 4's
 * "search the attached Vector Store", and the citation example. Recording it
 * verbatim in the audit trail is what lets the prompt delta be shown.
 */
export function buildGroundingBlock(passages: RetrievedPassage[]): string {
  if (passages.length === 0) {
    return [
      '',
      '## Course Materials (retrieved)',
      'No course materials were retrieved for this question. Do not search for',
      'materials — none are attached. Leave "citations" as an empty array and',
      'lower "confidence" accordingly.',
    ].join('\n');
  }

  const blocks = passages.map(p => `[${p.label}] (${p.documentName}, ${p.locator})\n${p.text}`);

  return [
    '',
    '## Course Materials (retrieved)',
    'These passages replace the Vector Store referenced above: they are the only',
    'course materials available, and there is nothing else to search. Cite them',
    'by label only — put entries like "M1" or "M3" in the "citations" array, and',
    'nothing else. Do not invent a label that does not appear below.',
    '',
    ...blocks,
  ].join('\n');
}
