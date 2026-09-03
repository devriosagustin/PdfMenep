import 'server-only';
import { PDFDocument } from 'pdf-lib';

export class PdfSplitError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'selection_failed' | 'empty_doc' | 'timeout',
    public readonly reason?: 'password' | 'corrupt' | 'out_of_range',
  ) {
    super();
  }
}

export type PageSelection = { mode: 'all' } | { mode: 'pages'; pages: number[] };

export interface PdfSplitInput {
  bytes: Uint8Array;
  selection: PageSelection;
}

export interface PdfSplitResult {
  pdf: Uint8Array;
  pageCount: number;
}

const SPLIT_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfSplitError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function extractPdfPages(input: PdfSplitInput): Promise<PdfSplitResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfSplitError('invalid_pdf', 'password');
      }
      throw new PdfSplitError('invalid_pdf', 'corrupt');
    }

    const originalIndices = src.getPageIndices();
    if (originalIndices.length === 0) {
      throw new PdfSplitError('empty_doc');
    }

    let targetIndices: number[];
    if (input.selection.mode === 'all') {
      targetIndices = originalIndices.slice();
    } else {
      const filtered = input.selection.pages
        .filter((p) => Number.isInteger(p) && p >= 1)
        .map((p) => p - 1);
      if (filtered.some((idx) => idx >= originalIndices.length)) {
        throw new PdfSplitError('selection_failed', 'out_of_range');
      }
      targetIndices = filtered;
    }

    if (targetIndices.length === 0) {
      throw new PdfSplitError('empty_doc');
    }

    try {
      const merged = await PDFDocument.create();
      const copied = await merged.copyPages(src, targetIndices);
      for (const page of copied) merged.addPage(page);
      const pdf = await merged.save();
      return { pdf, pageCount: copied.length };
    } catch (err) {
      if (err instanceof PdfSplitError) throw err;
      throw new PdfSplitError('selection_failed');
    }
  })();
  return raceTimeout(work, SPLIT_TIMEOUT_MS);
}
