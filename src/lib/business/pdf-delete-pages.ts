import 'server-only';
import { PDFDocument } from 'pdf-lib';

export class PdfDeletePagesError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'delete_failed'
      | 'empty_doc'
      | 'selection_failed'
      | 'timeout',
    public readonly reason?: 'password' | 'corrupt' | 'out_of_range' | 'duplicate',
  ) {
    super();
  }
}

export interface PdfDeletePagesInput {
  bytes: Uint8Array;
  pages: number[];
}

export interface PdfDeletePagesResult {
  pdf: Uint8Array;
  remainingPages: number;
}

const DELETE_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfDeletePagesError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function deletePdfPages(input: PdfDeletePagesInput): Promise<PdfDeletePagesResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfDeletePagesError('invalid_pdf', 'password');
      }
      throw new PdfDeletePagesError('invalid_pdf', 'corrupt');
    }

    const pageCount = src.getPageCount();
    if (pageCount === 0) {
      throw new PdfDeletePagesError('empty_doc');
    }

    // Defense-in-depth: the wire envelope already validated shape, dedup
    // and the global MAX_PAGES cap, but we still re-check the per-document
    // range so a stale payload can't trample the page tree, and the
    // post-deletion floor (>= 1 remaining page) so we never emit an empty
    // PDF on the wire.
    const seen = new Set<number>();
    for (const n of input.pages) {
      if (!Number.isInteger(n) || n < 1) {
        throw new PdfDeletePagesError('selection_failed', 'out_of_range');
      }
      if (seen.has(n)) {
        throw new PdfDeletePagesError('selection_failed', 'duplicate');
      }
      seen.add(n);
      if (n > pageCount) {
        throw new PdfDeletePagesError('selection_failed', 'out_of_range');
      }
    }
    if (pageCount - input.pages.length < 1) {
      throw new PdfDeletePagesError('selection_failed', 'out_of_range');
    }

    try {
      const sortedDesc = [...input.pages].sort((a, b) => b - a);
      for (const oneBased of sortedDesc) {
        src.removePage(oneBased - 1);
      }
      const pdf = await src.save();
      return { pdf, remainingPages: pageCount - input.pages.length };
    } catch (err) {
      if (err instanceof PdfDeletePagesError) throw err;
      throw new PdfDeletePagesError('delete_failed');
    }
  })();

  return raceTimeout(work, DELETE_TIMEOUT_MS);
}
