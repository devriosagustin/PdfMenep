import 'server-only';
import { createRequire } from 'node:module';

import { MAX_PAGES } from '@/lib/contracts/pdf-convert';

interface PdfTextItemLike {
  str?: unknown;
  hasEOL?: unknown;
  transform?: unknown;
  width?: unknown;
}
interface PdfTextContentLike {
  items: PdfTextItemLike[];
}
interface PdfPageLike {
  getTextContent: () => Promise<PdfTextContentLike>;
  cleanup: () => void;
}
interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
}
interface PdfPdfjsLike {
  getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocLike> };
}

const pdfjsLib = createRequire(import.meta.url)('pdfjs-dist/legacy/build/pdf.mjs') as PdfPdfjsLike;

export class PdfExtractTextError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'encrypted_pdf'
      | 'empty_pdf'
      | 'extract_failed'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

export interface PdfExtractTextResult {
  text: string;
  pageCount: number;
}

const EXTRACT_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new PdfExtractTextError('timeout', 'Extracción de texto del PDF tardó demasiado')),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function buildPageText(items: PdfTextItemLike[]): string {
  const lines: string[] = [];
  let buffer = '';
  let previousY: number | null = null;
  for (const item of items) {
    if (typeof item.str !== 'string') continue;
    const y =
      Array.isArray(item.transform) && item.transform.length > 5
        ? asNumber((item.transform as unknown[])[5])
        : null;
    const hasEOL = item.hasEOL === true;
    const lineBreak =
      hasEOL || (previousY !== null && y !== null && previousY - y >= Math.max(previousY / 2, 4));
    if (lineBreak && buffer.length > 0) {
      lines.push(buffer);
      buffer = '';
    }
    if (buffer.length > 0) {
      if (!lineBreak) buffer += ' ';
    }
    buffer += item.str;
    if (y !== null) previousY = y;
  }
  if (buffer.length > 0) lines.push(buffer);
  return lines.join('\n');
}

export async function extractTextFromPdf(bytes: Uint8Array): Promise<PdfExtractTextResult> {
  const work = (async (): Promise<PdfExtractTextResult> => {
    const loadingTask = pdfjsLib.getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
      disableStream: true,
      isEvalSupported: false,
    });

    let doc: PdfDocLike;
    try {
      doc = await loadingTask.promise;
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfExtractTextError('encrypted_pdf', 'El PDF está protegido con contraseña');
      }
      throw new PdfExtractTextError('invalid_pdf', 'No se pudo leer el PDF');
    }

    try {
      const totalPages = doc.numPages;
      if (totalPages < 1) {
        throw new PdfExtractTextError('empty_pdf', 'El PDF no contiene páginas');
      }
      if (totalPages > MAX_PAGES) {
        throw new PdfExtractTextError(
          'invalid_pdf',
          `El PDF tiene ${totalPages} páginas; el máximo permitido es ${MAX_PAGES}`,
        );
      }

      const pageTexts: string[] = [];
      for (let i = 1; i <= totalPages; i++) {
        const page = await doc.getPage(i);
        try {
          const content = await page.getTextContent();
          pageTexts.push(buildPageText(content.items));
        } finally {
          try {
            page.cleanup();
          } catch {
            // ignore cleanup failures on individual pages
          }
        }
      }

      return { text: pageTexts.join('\f'), pageCount: totalPages };
    } finally {
      try {
        await doc.destroy();
      } catch {
        // ignore — pdfjs's destroy() can throw on already-torn-down docs
      }
    }
  })();

  try {
    return await raceTimeout(work, EXTRACT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof PdfExtractTextError) throw err;
    throw new PdfExtractTextError('extract_failed', 'No se pudo extraer el texto del PDF');
  }
}
