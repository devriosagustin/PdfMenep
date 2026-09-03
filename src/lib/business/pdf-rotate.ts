import 'server-only';
import { degrees, PDFDocument } from 'pdf-lib';

export interface PdfRotateRule {
  page: number;
  deg: 90 | 180 | 270;
}

export class PdfRotateError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'rotate_failed'
      | 'empty_doc'
      | 'selection_failed'
      | 'timeout',
    public readonly reason?: 'password' | 'corrupt' | 'out_of_range' | 'duplicate',
  ) {
    super();
  }
}

export interface PdfRotateInput {
  bytes: Uint8Array;
  rotations: PdfRotateRule[];
}

export interface PdfRotateResult {
  pdf: Uint8Array;
  pageCount: number;
}

const ROTATE_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfRotateError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function degToAngle(deg: 90 | 180 | 270): number {
  return deg;
}

export async function rotatePdfPages(input: PdfRotateInput): Promise<PdfRotateResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfRotateError('invalid_pdf', 'password');
      }
      throw new PdfRotateError('invalid_pdf', 'corrupt');
    }

    const pages = src.getPages();
    if (pages.length === 0) {
      throw new PdfRotateError('empty_doc');
    }

    const seen = new Set<number>();
    for (const rule of input.rotations) {
      if (seen.has(rule.page)) {
        throw new PdfRotateError('selection_failed', 'duplicate');
      }
      seen.add(rule.page);
      if (rule.page < 1 || rule.page > pages.length) {
        throw new PdfRotateError('selection_failed', 'out_of_range');
      }
    }

    try {
      for (const rule of input.rotations) {
        const page = pages[rule.page - 1];
        if (!page) continue;
        page.setRotation(degrees(degToAngle(rule.deg)));
      }
      const pdf = await src.save();
      return { pdf, pageCount: pages.length };
    } catch (err) {
      if (err instanceof PdfRotateError) throw err;
      throw new PdfRotateError('rotate_failed');
    }
  })();

  return raceTimeout(work, ROTATE_TIMEOUT_MS);
}
