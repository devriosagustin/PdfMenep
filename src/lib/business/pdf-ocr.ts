import 'server-only';
import { PDFDocument } from 'pdf-lib';

import { MAX_OCR_PAGES } from '@/lib/contracts/pdf-ocr';

export type OcrLanguage = 'es' | 'en';

export interface PdfOcrInput {
  filename: string;
  bytes: Uint8Array;
  language: OcrLanguage;
  pageSelection: number[] | null;
}

export interface PdfOcrResult {
  pdf: Uint8Array;
  pageCount: number;
}

export class PdfOcrError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'page_limit'
      | 'selection_failed'
      | 'select_failed'
      | 'ocr_failed'
      | 'timeout',
    public readonly reason?: 'password' | 'corrupt' | 'empty' | 'out_of_range' | 'duplicate',
  ) {
    super();
  }
}

const OCR_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfOcrError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function runOcrOnPdf(input: PdfOcrInput): Promise<PdfOcrResult> {
  const work = (async (): Promise<PdfOcrResult> => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfOcrError('invalid_pdf', 'password');
      }
      throw new PdfOcrError('invalid_pdf', 'corrupt');
    }

    const totalPages = src.getPageCount();
    if (totalPages === 0) {
      throw new PdfOcrError('invalid_pdf', 'empty');
    }
    if (totalPages > MAX_OCR_PAGES) {
      throw new PdfOcrError('page_limit');
    }

    const selection = input.pageSelection;
    if (selection !== null) {
      const seen = new Set<number>();
      for (const n of selection) {
        if (!Number.isInteger(n) || n < 1) {
          throw new PdfOcrError('selection_failed', 'out_of_range');
        }
        if (seen.has(n)) throw new PdfOcrError('selection_failed', 'duplicate');
        seen.add(n);
        if (n > totalPages) throw new PdfOcrError('selection_failed', 'out_of_range');
      }
      if (selection.length === 0) {
        throw new PdfOcrError('selection_failed', 'out_of_range');
      }
    }

    try {
      const indices =
        selection !== null
          ? selection.map((n) => n - 1).sort((a, b) => a - b)
          : src.getPageIndices();
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, indices);
      for (const page of copied) out.addPage(page);
      void input.language; // language is wired through once a real OCR backend lands
      const pdf = await out.save();
      return { pdf: new Uint8Array(pdf), pageCount: copied.length };
    } catch (err) {
      if (err instanceof PdfOcrError) throw err;
      throw new PdfOcrError('ocr_failed');
    }
  })();

  return raceTimeout(work, OCR_TIMEOUT_MS);
}
