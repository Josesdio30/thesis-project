/**
 * Course-material text extraction for the local RAG corpus.
 *
 * Every parser returns `Section[]` — one section per page (PDF), slide (PPTX),
 * or whole document (DOCX/TXT). Sections exist so a citation can name a real
 * position in a real file (`p. 12`), which is what makes local citations
 * checkable in a way the OpenAI `file_search` path never was.
 *
 * Dispatch is on the extension of the original `file_name`, NOT on
 * `resources.file_type` — that column is a free-form VarChar and is not
 * reliable.
 */

export interface Section {
  /** Human-readable position, e.g. 'p. 12' / 'slide 4' / 'document'. */
  locator: string;
  text: string;
}

export interface ParsedDocument {
  sections: Section[];
  charCount: number;
  /**
   * Set when extraction produced suspiciously little text for the file size —
   * a scanned PDF or image-only slide deck. There is deliberately no OCR here;
   * this flag surfaces the limitation through the `warning` field the UI
   * already renders rather than silently indexing an empty document.
   */
  lowText: boolean;
}

export class UnsupportedFileTypeError extends Error {
  constructor(readonly extension: string) {
    const what = extension ? `file type ".${extension}"` : 'file without an extension';
    super(`Unsupported ${what} — supported: pdf, docx, pptx, txt, md`);
    this.name = 'UnsupportedFileTypeError';
  }
}

/** Bytes of file per extracted character below which we suspect a scan. */
const LOW_TEXT_BYTES_PER_CHAR = 500;
const LOW_TEXT_MIN_CHARS = 200;

export function extensionOf(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim());
  return match ? match[1].toLowerCase() : '';
}

// C0 controls and DEL, except tab, newline and carriage return. Postgres TEXT
// rejects NUL outright, and PDF text layers can contain any of these.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function normalizeWhitespace(text: string): string {
  return text
    .replace(CONTROL_CHARS, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

/**
 * Uses the legacy build, which runs without a DOM. Only the embedded text
 * layer is read: a scanned PDF yields nothing and is reported via `lowText`.
 */
export async function parsePdf(buffer: Buffer): Promise<Section[]> {
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // In pdfjs v6 `destroy()` lives on the loading task, not the document — the
  // document only exposes `cleanup()`. Holding the task is what makes the
  // worker releasable.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;

  const sections: Section[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        const text = normalizeWhitespace(
          content.items.map((item: any) => (typeof item.str === 'string' ? item.str : '')).join(' ')
        );
        if (text) sections.push({ locator: `p. ${pageNumber}`, text });
      } finally {
        page.cleanup();
      }
    }
  } finally {
    await loadingTask.destroy();
  }
  return sections;
}

/* ── DOCX ───────────────────────────────────────────────────────────────── */

export async function parseDocx(buffer: Buffer): Promise<Section[]> {
  const mammoth: any = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  const text = normalizeWhitespace(value ?? '');
  return text ? [{ locator: 'document', text }] : [];
}

/* ── PPTX ───────────────────────────────────────────────────────────────── */

const SLIDE_PATH = /^ppt\/slides\/slide(\d+)\.xml$/;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, '&');
}

/**
 * A .pptx is a zip. Reading `ppt/slides/slideN.xml` directly and pulling the
 * `<a:t>` runs keeps slide boundaries intact — general-purpose extractors
 * flatten the deck into one blob, which destroys the slide locator.
 */
export async function parsePptx(buffer: Buffer): Promise<Section[]> {
  const { unzipSync, strFromU8 }: any = await import('fflate');
  const files = unzipSync(new Uint8Array(buffer));

  const slides: { index: number; text: string }[] = [];
  for (const path of Object.keys(files)) {
    const match = SLIDE_PATH.exec(path);
    if (!match) continue;
    const xml = strFromU8(files[path]);
    // The tag name must end here: `<a:t[^>]*>` also matches `<a:tabLst>`,
    // which swallows raw XML up to the next `</a:t>`. Requiring whitespace or
    // `>` immediately after `a:t` is what keeps text runs text.
    const runs = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g)].map(m => decodeXmlEntities(m[1]));
    const text = normalizeWhitespace(runs.join(' '));
    if (text) slides.push({ index: Number(match[1]), text });
  }

  // Zip entry order is not slide order.
  slides.sort((a, b) => a.index - b.index);
  return slides.map(s => ({ locator: `slide ${s.index}`, text: s.text }));
}

/* ── Plain text ─────────────────────────────────────────────────────────── */

export function parsePlainText(buffer: Buffer): Section[] {
  const text = normalizeWhitespace(buffer.toString('utf8'));
  return text ? [{ locator: 'document', text }] : [];
}

/* ── Dispatch ───────────────────────────────────────────────────────────── */

export async function parseDocument(fileName: string, buffer: Buffer): Promise<ParsedDocument> {
  const extension = extensionOf(fileName);

  let sections: Section[];
  switch (extension) {
    case 'pdf':  sections = await parsePdf(buffer);  break;
    case 'docx': sections = await parseDocx(buffer); break;
    case 'pptx': sections = await parsePptx(buffer); break;
    case 'txt':
    case 'md':   sections = parsePlainText(buffer);  break;
    default:     throw new UnsupportedFileTypeError(extension);
  }

  const charCount = sections.reduce((total, section) => total + section.text.length, 0);
  return {
    sections,
    charCount,
    lowText: charCount < LOW_TEXT_MIN_CHARS && buffer.length > charCount * LOW_TEXT_BYTES_PER_CHAR,
  };
}
