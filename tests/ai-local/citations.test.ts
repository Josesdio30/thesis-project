import { resolveCitations, buildGroundingBlock } from '@/lib/ai-local/citations';
import { GRADING_RESULT_SCHEMA } from '@/lib/ai-local/grading-schema';
import type { RetrievedPassage } from '@/lib/ai/types';

const passage = (label: string, documentName: string, locator: string): RetrievedPassage => ({
  label, documentName, locator, text: `text of ${label}`, score: 0.7,
});

const PASSAGES = [
  passage('M1', 'Modul Kimia.pdf', 'p. 13'),
  passage('M2', 'Bioinformatics.pptx', 'slide 4'),
  passage('M3', 'catatan.txt', 'document'),
];

describe('resolveCitations', () => {
  it('maps labels to the frozen [source_page_n] citation form', () => {
    expect(resolveCitations(['M1', 'M2', 'M3'], PASSAGES)).toEqual([
      '[Modul_Kimia.pdf_page_13]',
      '[Bioinformatics.pptx_slide_4]',
      '[catatan.txt]',
    ]);
  });

  it.each([['[M2]'], ['(M2)'], ['see M2 for the definition'], ['m2']])(
    'recognises the label written as %p',
    entry => expect(resolveCitations([entry], PASSAGES)).toEqual(['[Bioinformatics.pptx_slide_4]'])
  );

  // The whole point: a model can confidently cite a passage it never saw.
  it('drops labels that were not retrieved', () => {
    expect(resolveCitations(['M9', 'M1'], PASSAGES)).toEqual(['[Modul_Kimia.pdf_page_13]']);
  });

  it('deduplicates and orders by retrieval rank, not by mention order', () => {
    expect(resolveCitations(['M3', 'M1', 'M1'], PASSAGES)).toEqual([
      '[Modul_Kimia.pdf_page_13]',
      '[catatan.txt]',
    ]);
  });

  it.each([
    ['a non-array value', 'M1' as unknown as string[], PASSAGES],
    ['null', null, PASSAGES],
    ['no retrieved passages', ['M1'], []],
  ])('returns nothing for %s', (_label, emitted, passages) => {
    expect(resolveCitations(emitted as string[] | null, passages)).toEqual([]);
  });

  it('ignores non-string entries in the array', () => {
    expect(resolveCitations([42 as unknown as string, 'M1'], PASSAGES)).toEqual([
      '[Modul_Kimia.pdf_page_13]',
    ]);
  });

  // Regression: every chunk of a .txt resolves to the same `[file]`, so a
  // four-passage answer emitted the identical citation four times.
  it('deduplicates passages that resolve to the same citation string', () => {
    const sameFile = [
      passage('M1', 'geografi.txt', 'document'),
      passage('M2', 'geografi.txt', 'document'),
      passage('M3', 'modul.pdf', 'p. 7'),
      passage('M4', 'modul.pdf', 'p. 7'),
    ];
    expect(resolveCitations(['M1', 'M2', 'M3', 'M4'], sameFile)).toEqual([
      '[geografi.txt]',
      '[modul.pdf_page_7]',
    ]);
  });

  it('does not match a label that is part of a longer token', () => {
    expect(resolveCitations(['M12', 'HM1'], PASSAGES)).toEqual([]);
  });
});

describe('buildGroundingBlock', () => {
  it('lists each passage with its label, source and locator', () => {
    const block = buildGroundingBlock(PASSAGES);
    expect(block).toContain('## Course Materials (retrieved)');
    expect(block).toContain('[M1] (Modul Kimia.pdf, p. 13)');
    expect(block).toContain('text of M1');
    // Supersedes rule 4 of the frozen prompt, which tells the model to search
    // a Vector Store that does not exist locally.
    expect(block).toMatch(/replace the Vector Store/);
  });

  it('tells the model there is nothing to search when retrieval came back empty', () => {
    const block = buildGroundingBlock([]);
    expect(block).toMatch(/No course materials were retrieved/);
    expect(block).toMatch(/empty array/);
  });
});

describe('GRADING_RESULT_SCHEMA', () => {
  // A schema that drifts from lib/types/correction.ts produces rows that fail
  // silently downstream.
  it('requires exactly the GradingResult fields', () => {
    expect(GRADING_RESULT_SCHEMA.required).toEqual([
      'score', 'max_score', 'qualitative_grade', 'feedback', 'citations',
      'confidence', 'rubric_alignment', 'language_detected', 'token_usage_estimate',
    ]);
  });

  it('allows a null score and constrains the enums', () => {
    const props = GRADING_RESULT_SCHEMA.properties as Record<string, any>;
    expect(props.score.type).toEqual(['number', 'null']);
    expect(props.confidence.enum).toEqual(['low', 'medium', 'high']);
    expect(props.language_detected.enum).toEqual(['id', 'en']);
    expect(props.rubric_alignment.additionalProperties.enum).toEqual(['pass', 'fail']);
  });

  it('is frozen so a caller cannot mutate the shared schema', () => {
    expect(Object.isFrozen(GRADING_RESULT_SCHEMA)).toBe(true);
  });
});
