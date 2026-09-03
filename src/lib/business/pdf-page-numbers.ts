import 'server-only';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import type { PdfNumberPosition } from '@/lib/contracts/pdf-page-numbers';

export class PdfPageNumbersError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'stamp_failed' | 'empty_doc' | 'timeout',
    public readonly reason?: 'password' | 'corrupt',
  ) {
    super();
  }
}

export interface PdfPageNumbersInput {
  bytes: Uint8Array;
  position: PdfNumberPosition;
  startingNumber: number;
}

export interface PdfPageNumbersResult {
  pdf: Uint8Array;
  pageCount: number;
}

const STAMP_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfPageNumbersError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

interface XY {
  x: number;
  y: number;
}

function computePosition(
  position: PdfNumberPosition,
  width: number,
  height: number,
  textWidth: number,
  textSize: number,
  margin: number,
): XY {
  let x = margin;
  if (position.endsWith('-center')) {
    x = (width - textWidth) / 2;
  } else if (position.endsWith('-right')) {
    x = width - textWidth - margin;
  }
  const y = position.startsWith('top-') ? height - margin - textSize : margin;
  return { x, y };
}

export async function stampPageNumbers(input: PdfPageNumbersInput): Promise<PdfPageNumbersResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfPageNumbersError('invalid_pdf', 'password');
      }
      throw new PdfPageNumbersError('invalid_pdf', 'corrupt');
    }

    const pages = src.getPages();
    if (pages.length === 0) {
      throw new PdfPageNumbersError('empty_doc');
    }

    try {
      const font = await src.embedFont(StandardFonts.Helvetica);
      const size = 10;
      const margin = 24;
      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        if (!page) continue;
        const { width, height } = page.getSize();
        const label = String(input.startingNumber + pageIndex);
        const textWidth = font.widthOfTextAtSize(label, size);
        const { x, y } = computePosition(input.position, width, height, textWidth, size, margin);
        page.drawText(label, { x, y, size, font });
      }
      const pdf = await src.save();
      return { pdf, pageCount: pages.length };
    } catch (err) {
      if (err instanceof PdfPageNumbersError) throw err;
      throw new PdfPageNumbersError('stamp_failed');
    }
  })();

  return raceTimeout(work, STAMP_TIMEOUT_MS);
}
