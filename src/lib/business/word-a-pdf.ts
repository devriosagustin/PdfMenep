import 'server-only';

import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

export class DocxToPdfError extends Error {
  constructor(
    public readonly code:
      | 'docx_parse_failed'
      | 'docx_no_document'
      | 'docx_protected'
      | 'convert_failed'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface DocxToPdfResult {
  pdf: Uint8Array;
  pageCount: number;
  bodyText: string;
  perPageText: string[];
}

const CONVERT_TIMEOUT_MS = 30_000;
const PAGE_WIDTH = 595; // A4 in points (72 dpi)
const PAGE_HEIGHT = 842;
const MARGIN_X = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.4;

// Approximate average glyph width for Helvetica @ 11pt (used for line wrap).
const GLYPH_WIDTH = FONT_SIZE * 0.55;
const MAX_CHARS_PER_LINE = Math.floor((PAGE_WIDTH - 2 * MARGIN_X) / GLYPH_WIDTH);

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new DocxToPdfError('timeout', 'Conversión de DOCX a PDF tardó demasiado')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// XML tag-extraction walker: rather than a full XML parser (xmldom isn't on
// the deps and the refuse-external-NPM-packages contract bars adding one),
// we walk the body of `word/document.xml` and split out `<w:t>` text runs,
// `<w:p>` paragraph breaks, and `<w:br/>` line breaks. The walker tolerates
// additional attributes on every tag by keeping only the tag/local name.
type WalkEntry = { type: 'text'; value: string } | { type: 'break' } | { type: 'paragraph' };

export function walkDocumentXml(xml: string): WalkEntry[] {
  const entries: WalkEntry[] = [];

  // 1. Pull text between `</w:p>` and the next opening element as paragraph-end.
  // 2. Pull `<w:t>...</w:t>` text bodies.
  // 3. Pull `<w:br/>` (and `<w:br/>` family) as line-break markers.

  // First, splice out the body content between the opening `<w:body>` and the
  // closing `</w:body>` so footnote/header section variations don't pollute
  // the walker.
  const bodyMatch = /<w:body[^>]*>([\s\S]*)<\/w:body>/i.exec(xml);
  const body = bodyMatch?.[1] ?? xml;

  // We compose metadata about found tags with a character-level scan.
  // For each char in `body`, decide if it belongs to a text node or a tag.
  // Walk forward, collecting 3 buckets: open / close / self-closing tags, and
  // text between them.
  let i = 0;
  const len = body.length;
  let textBuffer = '';
  const flushText = () => {
    if (textBuffer.length > 0) {
      entries.push({ type: 'text', value: textBuffer });
      textBuffer = '';
    }
  };

  while (i < len) {
    const ch = body[i];
    if (ch !== '<') {
      textBuffer += ch;
      i++;
      continue;
    }
    // Stash any text we collected before the tag starts.
    flushText();
    // Find the next '>' (or the end of the body if malformed).
    const end = body.indexOf('>', i + 1);
    if (end < 0) break;
    const raw = body.slice(i + 1, end).trim();
    // Check for self-closing closing tags: `</w:p>`.
    const isClose = raw.startsWith('/');
    const tagBody = isClose ? raw.slice(1).trim() : raw;
    // Self-closing indicator: `<w:br />` or `<w:br/>` (handled as the tagBody
    // itself ends with `/`).
    const selfClosing = !isClose && /\/$/.test(tagBody);
    const localName = tagBody.replace(/\/.*$/, '').split(/\s+/)[0] ?? '';
    i = end + 1;

    if (isClose) {
      if (localName === 'w:p' || localName === 'p') {
        flushText();
        entries.push({ type: 'paragraph' });
      }
      continue;
    }
    if (selfClosing) {
      if (localName === 'w:br' || localName === 'br') {
        flushText();
        entries.push({ type: 'break' });
      }
      continue;
    }
    // Skip opening <w:t> / `</w:t>` by NOT flushing content (we don't push
    // anything for the tag itself); tag bodies are text we just collected
    // before the next tag.
    if (localName === 'w:t' || localName === 't') continue;
  }
  flushText();
  return entries;
}

async function unzipDocxToEntries(
  bytes: Uint8Array,
): Promise<{ entries: WalkEntry[]; bodyText: string }> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocxToPdfError(
      'docx_parse_failed',
      'No se pudo leer el DOCX — el archivo podría estar dañado',
    );
  }
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    // Some tools store as 'word/document2.xml' on encrypted docs. We refuse
    // those (they'd require a password anyway).
    throw new DocxToPdfError(
      'docx_no_document',
      'El DOCX no contiene el documento principal (word/document.xml)',
    );
  }
  const xml = await docEntry.async('string');

  // Crude password-encrypted check: any 'documentProtection' write-token
  // tag or a 'writeProtection' element means the doc is protected. We bail
  // before attempting heavy parse work.
  if (/<w:documentProtection\b/i.test(xml) || /<w:writeProtection\b/i.test(xml)) {
    throw new DocxToPdfError('docx_protected', 'El DOCX está protegido con contraseña');
  }
  const entries = walkDocumentXml(xml);
  // Build a tool tip text for tests that want to inspect content.
  let bodyText = '';
  for (const entry of entries) {
    if (entry.type === 'text') bodyText += entry.value;
    if (entry.type === 'break') bodyText += '\n';
    if (entry.type === 'paragraph') bodyText += '\n';
  }
  return { entries, bodyText };
}

// Group `WalkEntry` items into flat-page boundaries. Each w:p break creates a
// new "page" candidate; multi-line text on a single paragraph gets wrapped
// across pages. We aim for "one paragraph per page" so the user sees the
// document's natural page boundaries in the resulting PDF.

// Build a flat list of "text units" (strings) from the entries, splitting on
// each paragraph into its own unit. Multi-line text within a paragraph is
// line-wrapped (using the same 80-col helper as PDF builder).
function buildUnits(entries: WalkEntry[]): string[] {
  const units: string[] = [];
  let current = '';
  const flush = () => {
    if (current.trim().length > 0) {
      units.push(current.replace(/\n+$/, ''));
    }
    current = '';
  };
  for (const entry of entries) {
    if (entry.type === 'paragraph') {
      flush();
    } else if (entry.type === 'break') {
      current += '\n';
    } else {
      current += entry.value;
    }
  }
  flush();
  return units;
}

export async function convertDocxToPdf(bytes: Uint8Array): Promise<DocxToPdfResult> {
  const work = (async (): Promise<DocxToPdfResult> => {
    const { entries, bodyText } = await unzipDocxToEntries(bytes);
    if (entries.length === 0) {
      // Treat an empty document as a single empty page (no text).
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      page.drawText('', {
        x: MARGIN_X,
        y: PAGE_HEIGHT - MARGIN_TOP,
        size: FONT_SIZE,
        font,
      });
      const out = await doc.save();
      return {
        pdf: new Uint8Array(out),
        pageCount: 1,
        bodyText,
        perPageText: [''],
      };
    }
    const units = buildUnits(entries);
    // Pages are split "one paragraph per page" — when a paragraph overflows
    // it gets further paginated.
    const perPageText: string[] = [];
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);

    for (const raw of units) {
      const text = raw.replace(/\s+$/, '');
      if (text.length === 0) {
        perPageText.push('');
        continue;
      }
      // Soft wrap the paragraph text at MAX_CHARS_PER_LINE.
      const lines: string[] = [];
      for (const line of text.split('\n')) {
        if (line.length === 0) {
          lines.push('');
          continue;
        }
        // Use the GLYPH_WIDTH heuristic but cap at MAX_CHARS_PER_LINE chars.
        const wrapped: string[] = [];
        const words = line.split(/\s+/);
        let buffer = '';
        for (const word of words) {
          if (buffer.length === 0) {
            buffer = word;
            continue;
          }
          if (buffer.length + 1 + word.length > MAX_CHARS_PER_LINE) {
            wrapped.push(buffer);
            buffer = word;
          } else {
            buffer = `${buffer} ${word}`;
          }
        }
        if (buffer.length > 0) wrapped.push(buffer);
        lines.push(...wrapped);
      }

      // Render each line; when the cursor would go below MARGIN_BOTTOM emit
      // a new page. We then add the page to perPageText in order.
      const perPageLines: string[][] = [];
      let currentLines: string[] = [];
      for (const line of lines) {
        // The vertical line capacity is (PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / LINE_HEIGHT
        const capacity = Math.floor((PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM) / LINE_HEIGHT);
        // We're going to write 1 line to currentLines.
        if (currentLines.length >= capacity) {
          perPageLines.push(currentLines);
          currentLines = [];
        }
        currentLines.push(line);
      }
      if (currentLines.length > 0) perPageLines.push(currentLines);

      // Emit per-page text first (so perPageText tracks the actual layout).
      for (const pageLines of perPageLines) {
        perPageText.push(pageLines.join('\n'));
        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        let y = PAGE_HEIGHT - MARGIN_TOP - FONT_SIZE;
        for (const line of pageLines) {
          page.drawText(line, {
            x: MARGIN_X,
            y,
            size: FONT_SIZE,
            font,
          });
          y -= LINE_HEIGHT;
        }
      }
    }

    if (perPageText.length === 0) {
      // Even if extractTextFromPdf is empty, mint a single empty page so the
      // user sees a "blank" PDF instead of an empty bytes blob.
      const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      const y = PAGE_HEIGHT - MARGIN_TOP - FONT_SIZE;
      page.drawText('', {
        x: MARGIN_X,
        y,
        size: FONT_SIZE,
        font,
      });
      perPageText.push('');
    }

    const out = await doc.save();
    return {
      pdf: new Uint8Array(out),
      pageCount: perPageText.length,
      bodyText,
      perPageText,
    };
  })();

  try {
    return await raceTimeout(work, CONVERT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof DocxToPdfError) throw err;
    throw new DocxToPdfError('convert_failed', 'No se pudo convertir el DOCX a PDF');
  }
}

// Re-export the DocxToPdfError so route handlers can introspect.
// (walkDocumentXml is the implementation; tests import it via `./word-a-pdf`.)
