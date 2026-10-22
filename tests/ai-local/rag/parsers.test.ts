import { zipSync, strToU8 } from 'fflate';
import {
  parseDocument, parsePlainText, parsePptx, extensionOf, UnsupportedFileTypeError,
} from '@/lib/ai-local/rag/parsers';

// pdfjs-dist v6 ships ESM only and cannot be parsed by ts-jest's CJS runtime.
// Mocking it is also the right unit boundary: what needs testing here is the
// page loop, the locator, and resource cleanup — not pdfjs itself.
const mockGetPage = jest.fn();
const mockDestroy = jest.fn();
const mockGetDocument = jest.fn();
jest.mock(
  'pdfjs-dist/legacy/build/pdf.mjs',
  () => ({ getDocument: (...args: unknown[]) => mockGetDocument(...args) }),
  { virtual: true }
);

const mockExtractRawText = jest.fn();
jest.mock('mammoth', () => ({ extractRawText: (...a: unknown[]) => mockExtractRawText(...a) }), {
  virtual: true,
});

const buf = (s: string) => Buffer.from(s, 'utf8');

/** Minimal .pptx: a zip with slide XML entries. */
function pptxFixture(slides: Record<string, string>): Buffer {
  const entries: Record<string, Uint8Array> = {
    'ppt/presentation.xml': strToU8('<p:presentation/>'),
  };
  for (const [path, xml] of Object.entries(slides)) entries[path] = strToU8(xml);
  return Buffer.from(zipSync(entries));
}

describe('extensionOf', () => {
  it.each([
    ['notes.PDF', 'pdf'],
    ['  deck.pptx  ', 'pptx'],
    ['archive.tar.gz', 'gz'],
    ['no-extension', ''],
  ])('%p -> %p', (name, expected) => expect(extensionOf(name)).toBe(expected));
});

describe('parsePlainText', () => {
  it('collapses whitespace and returns one document section', () => {
    expect(parsePlainText(buf('  Baris  satu\r\n\r\n\r\n\r\nBaris dua  '))).toEqual([
      { locator: 'document', text: 'Baris satu\n\nBaris dua' },
    ]);
  });

  it('returns no section for an empty file', () => {
    expect(parsePlainText(buf('   \n  '))).toEqual([]);
  });

  // Postgres TEXT rejects 0x00 ("invalid byte sequence for encoding UTF8"),
  // and some PDFs (observed: Words_and_Tokens.pdf) yield NULs and other C0
  // control characters from their text layer. Tabs and newlines are kept.
  it('strips NUL and other control characters but keeps tabs and newlines', () => {
    expect(parsePlainText(buf('to\u0000ken\u0001s\u0007\tok\u001f\nline\u007f two'))).toEqual([
      { locator: 'document', text: 'tokens ok\nline two' },
    ]);
  });

  it('returns no section when a file holds only control characters', () => {
    expect(parsePlainText(buf('\u0000\u0000\u0001'))).toEqual([]);
  });
});

describe('parsePptx', () => {
  it('reads text runs per slide and orders them numerically', async () => {
    // Zip entry order is not slide order; slide10 must not sort before slide2.
    const sections = await parsePptx(
      pptxFixture({
        'ppt/slides/slide10.xml': '<a:t>Tenth</a:t>',
        'ppt/slides/slide2.xml': '<a:t>Second</a:t>',
        'ppt/slides/slide1.xml': '<a:t>First</a:t><a:t>Title</a:t>',
      })
    );
    expect(sections).toEqual([
      { locator: 'slide 1', text: 'First Title' },
      { locator: 'slide 2', text: 'Second' },
      { locator: 'slide 10', text: 'Tenth' },
    ]);
  });

  // Regression: `<a:t[^>]*>` also matches `<a:tabLst>`, which swallowed raw XML
  // up to the next `</a:t>`. Caught against a real 8 MB deck.
  it('does not treat <a:tabLst> as a text run', async () => {
    const sections = await parsePptx(
      pptxFixture({
        'ppt/slides/slide1.xml':
          '<a:pPr><a:tabLst><a:tab pos="1337"/></a:tabLst></a:pPr><a:t>Real text</a:t>',
      })
    );
    expect(sections).toEqual([{ locator: 'slide 1', text: 'Real text' }]);
  });

  it('honours run attributes and decodes XML entities', async () => {
    const sections = await parsePptx(
      pptxFixture({ 'ppt/slides/slide1.xml': '<a:t dirty="0">A &amp; B &lt;x&gt; &#65;</a:t>' })
    );
    expect(sections[0].text).toBe('A & B <x> A');
  });

  it('skips slides with no text and ignores non-slide entries', async () => {
    const sections = await parsePptx(
      pptxFixture({ 'ppt/slides/slide1.xml': '<p:sp/>', 'docProps/app.xml': '<x>ignored</x>' })
    );
    expect(sections).toEqual([]);
  });
});

describe('parsePdf via parseDocument', () => {
  const pdfDoc = (pages: string[][]) => ({
    numPages: pages.length,
    getPage: mockGetPage.mockImplementation(async (n: number) => ({
      getTextContent: async () => ({ items: pages[n - 1].map(str => ({ str })) }),
      cleanup: jest.fn(),
    })),
  });

  it('emits one section per page with a page locator', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve(pdfDoc([['Halaman', 'satu'], ['Halaman dua']])),
      destroy: mockDestroy,
    });

    const parsed = await parseDocument('modul.pdf', buf('%PDF'));

    expect(parsed.sections).toEqual([
      { locator: 'p. 1', text: 'Halaman satu' },
      { locator: 'p. 2', text: 'Halaman dua' },
    ]);
    expect(parsed.charCount).toBe(23); // 12 + 11
    // v6 puts destroy() on the loading task, not the document.
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('skips blank pages and non-string items', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: '' }, { notStr: 1 }] }),
          cleanup: jest.fn(),
        }),
      }),
      destroy: mockDestroy,
    });
    const parsed = await parseDocument('scan.pdf', buf('%PDF'));
    expect(parsed.sections).toEqual([]);
  });

  it('releases the loading task even when a page throws', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => {
          throw new Error('corrupt page');
        },
      }),
      destroy: mockDestroy,
    });
    await expect(parseDocument('broken.pdf', buf('%PDF'))).rejects.toThrow('corrupt page');
    expect(mockDestroy).toHaveBeenCalled();
  });
});

describe('parseDocument', () => {
  it('extracts docx through mammoth', async () => {
    mockExtractRawText.mockResolvedValue({ value: 'Isi   dokumen' });
    const parsed = await parseDocument('materi.docx', buf('PK'));
    expect(parsed.sections).toEqual([{ locator: 'document', text: 'Isi dokumen' }]);
  });

  it('returns no section when mammoth yields nothing', async () => {
    mockExtractRawText.mockResolvedValue({ value: undefined });
    expect((await parseDocument('empty.docx', buf('PK'))).sections).toEqual([]);
  });

  it('dispatches .pptx through the slide parser', async () => {
    const parsed = await parseDocument(
      'deck.pptx',
      pptxFixture({ 'ppt/slides/slide1.xml': '<a:t>Judul slide</a:t>' })
    );
    expect(parsed.sections).toEqual([{ locator: 'slide 1', text: 'Judul slide' }]);
  });

  it.each(['catatan.txt', 'catatan.md'])('handles %s as plain text', async name => {
    const parsed = await parseDocument(name, buf('Halo dunia'));
    expect(parsed.sections).toEqual([{ locator: 'document', text: 'Halo dunia' }]);
    expect(parsed.lowText).toBe(false);
  });

  // No OCR by design — the flag surfaces the limitation instead of silently
  // indexing an empty document.
  it('flags a large file that yielded almost no text', async () => {
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getTextContent: async () => ({ items: [{ str: 'ii' }] }),
          cleanup: jest.fn(),
        }),
      }),
      destroy: mockDestroy,
    });
    const parsed = await parseDocument('scanned.pdf', Buffer.alloc(2_000_000));
    expect(parsed.lowText).toBe(true);
  });

  it('rejects an unsupported extension by name', async () => {
    await expect(parseDocument('sheet.xlsx', buf('PK'))).rejects.toBeInstanceOf(UnsupportedFileTypeError);
    await expect(parseDocument('noext', buf('x'))).rejects.toThrow(
      /Unsupported file without an extension/
    );
  });
});
