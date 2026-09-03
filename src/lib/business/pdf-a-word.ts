import 'server-only';

import JSZip from 'jszip';
import { extractTextFromPdf, PdfExtractTextError } from '@/lib/business/pdf-extract-text';
import { MAX_PAGES } from '@/lib/contracts/pdf-a-word';

export class PdfToWordError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'encrypted_pdf'
      | 'empty_pdf'
      | 'too_many_pages'
      | 'convert_failed'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface PdfToWordResult {
  docx: Uint8Array;
  pageCount: number;
  perPageText: string[];
}

const CONVERT_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new PdfToWordError('timeout', 'Conversión de PDF a Word tardó demasiado')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

// XML-safe text escape for the `<w:t>` body; Word reads XML, not raw text.
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Hard-wrap a text run so no paragraph exceeds the soft limit. This keeps
// the output page-readably without losing words mid-token.
function wrapPieces(text: string, width: number): string[] {
  const lines: string[] = [];
  // Normalize line endings + collapse straight tabs.
  const cleaned = text.replace(/\r\n?/g, '\n').replace(/\t/g, '  ');
  for (const rawLine of cleaned.split('\n')) {
    if (rawLine.length === 0) {
      lines.push('');
      continue;
    }
    const words = rawLine.split(/\s+/).filter(Boolean);
    let buffer = '';
    for (const word of words) {
      if (buffer.length === 0) {
        buffer = word;
        continue;
      }
      // +1 for the inter-word space.
      if (buffer.length + 1 + word.length > width) {
        lines.push(buffer);
        buffer = word;
      } else {
        buffer = `${buffer} ${word}`;
      }
    }
    if (buffer.length > 0) lines.push(buffer);
  }
  return lines;
}

// Build an OOXML paragraph for a single text run (may include line breaks).
function paragraphXml(text: string): string {
  const pieces = wrapPieces(text, 90);
  if (pieces.length === 0) return '<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>';
  const runs = pieces.map((piece, i) => {
    if (i === 0) {
      return `<w:r><w:t xml:space="preserve">${xmlEscape(piece)}</w:t></w:r>`;
    }
    return `<w:r><w:br/><w:t xml:space="preserve">${xmlEscape(piece)}</w:t></w:r>`;
  });
  return `<w:p>${runs.join('')}</w:p>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

function documentXml(body: string[]): string {
  const paragraphs = body.join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${paragraphs}</w:body>
</w:document>`;
}

function buildPageParagraphs(pageIndex: number, lines: string[]): string[] {
  const out: string[] = [];
  if (lines.length === 0) {
    out.push(paragraphXml(''));
  } else {
    for (const line of lines) {
      out.push(paragraphXml(line));
    }
  }
  // Sentinel line marking the source page (italic, gray) so the user can
  // visually separate pages when the .docx is opened.
  out.push(
    `<w:p><w:r><w:rPr><w:i/><w:color w:val="808080"/></w:rPr><w:t xml:space="preserve">— Página ${pageIndex} —</w:t></w:r></w:p>`,
  );
  return out;
}

export async function convertPdfToDocx(bytes: Uint8Array): Promise<PdfToWordResult> {
  const work = (async (): Promise<PdfToWordResult> => {
    const extracted = await extractTextFromPdf(bytes);
    if (extracted.pageCount > MAX_PAGES) {
      // Re-raise as PdfToWordError so the route handler can map the cap
      // message to a friendly Spanish cap response.
      throw new PdfToWordError(
        'too_many_pages',
        `El PDF tiene ${extracted.pageCount} páginas; el máximo permitido es ${MAX_PAGES}`,
      );
    }
    // Split the joined text on form feeds to build a per-page list.
    // Pages that contain `\f` round-trip cleanly because extractTextFromPdf
    // joins each page with `\f` and there is no other source of that char.
    const perPageText = extracted.text.length === 0 ? [] : extracted.text.split('\f');

    const paragraphs: string[] = [];
    perPageText.forEach((pageText, idx) => {
      // Lines coming out of buildPageText are joined with '\n' — split them
      // so each line becomes its own <w:p>.
      const lines = pageText.length === 0 ? [] : pageText.split('\n');
      const pageParagraphs = buildPageParagraphs(idx + 1, lines);
      paragraphs.push(...pageParagraphs);
    });

    const zip = new JSZip();
    zip.file('[Content_Types].xml', CONTENT_TYPES);
    zip.folder('_rels')?.file('.rels', ROOT_RELS);
    const wordFolder = zip.folder('word');
    if (!wordFolder) {
      throw new PdfToWordError('convert_failed', 'No se pudo preparar el DOCX');
    }
    wordFolder.file('document.xml', documentXml(paragraphs));
    const archive = await zip.generateAsync({
      type: 'uint8array',
      compression: 'DEFLATE',
    });
    return {
      docx: archive,
      pageCount: extracted.pageCount,
      perPageText,
    };
  })();

  try {
    return await raceTimeout(work, CONVERT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof PdfToWordError) throw err;
    if (err instanceof PdfExtractTextError) {
      if (err.code === 'timeout') {
        throw new PdfToWordError('timeout', err.message);
      }
      if (err.code === 'encrypted_pdf') {
        throw new PdfToWordError('encrypted_pdf', 'El PDF está protegido con contraseña');
      }
      if (err.code === 'empty_pdf') {
        throw new PdfToWordError('empty_pdf', 'El PDF no tiene páginas');
      }
      throw new PdfToWordError('invalid_pdf', err.message);
    }
    throw new PdfToWordError('convert_failed', 'No se pudo convertir el PDF a Word');
  }
}

// Re-export for tests that want to assert on the underlying PDF text walker
// without spinning up a DOCX ZIP.
export { extractTextFromPdf };
