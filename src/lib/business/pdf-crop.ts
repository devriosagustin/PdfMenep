import 'server-only';
import { PDFDocument } from 'pdf-lib';

import { MAX_PDF_BOX_MM } from '@/lib/contracts/pdf-crop';

export type CropOriginH = 'top' | 'bottom';

export interface PdfCropInput {
  bytes: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
  // top-left (originH='top') or bottom-left (originH='bottom'). The route is
  // expected to convert a bottom-left origin into a top-left box BEFORE
  // calling this helper — originH is informational here and the helper
  // stays agnostic. The route sets `origin: 'bottom'` to swap the y anchor
  // before forwarding the request.
  originH: CropOriginH;
}

export class PdfCropError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'crop_failed' | 'empty_doc' | 'timeout',
    public readonly reason?: 'password' | 'corrupt',
  ) {
    super();
  }
}

export interface PdfCropResult {
  pdf: Uint8Array;
  pageCount: number;
}

// PDF works in PostScript points (1 in = 72 pt). 25.4 mm = 1 in →
// 1 mm = 72/25.4 pt.
const MM_TO_PT = 72 / 25.4;

const CROP_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfCropError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function mmToPt(mm: number): number {
  return mm * MM_TO_PT;
}

export async function cropPdfPages(input: PdfCropInput): Promise<PdfCropResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfCropError('invalid_pdf', 'password');
      }
      throw new PdfCropError('invalid_pdf', 'corrupt');
    }

    const pages = src.getPages();
    if (pages.length === 0) {
      throw new PdfCropError('empty_doc');
    }

    // Defense-in-depth: the wire envelope already validated shape + bounds
    // relative to MAX_PDF_BOX_MM. We still re-check so a stale payload
    // can't trample the page tree.
    if (
      input.x < 0 ||
      input.y < 0 ||
      input.width <= 0 ||
      input.height <= 0 ||
      input.x > MAX_PDF_BOX_MM ||
      input.y > MAX_PDF_BOX_MM ||
      input.width > MAX_PDF_BOX_MM ||
      input.height > MAX_PDF_BOX_MM
    ) {
      throw new PdfCropError('crop_failed');
    }

    try {
      // The route already translates the bottom-left origin to a top-left
      // box the helper can apply uniformly. We just convert mm → pt and
      // assign CropBox + MediaBox; per-page origin differs are not modelled.
      for (const page of pages) {
        const xPt = mmToPt(input.x);
        const yPt =
          input.originH === 'bottom'
            ? Math.max(0, page.getSize().height - mmToPt(input.y) - mmToPt(input.height))
            : mmToPt(input.y);
        const wPt = Math.max(1, mmToPt(input.width));
        const heightPt = Math.max(1, mmToPt(input.height));
        const cropRect: [number, number, number, number] = [xPt, yPt, wPt, heightPt];
        page.setCropBox(...cropRect);
        page.setMediaBox(...cropRect);
      }
      const pdf = await src.save();
      return { pdf, pageCount: pages.length };
    } catch (err) {
      if (err instanceof PdfCropError) throw err;
      throw new PdfCropError('crop_failed');
    }
  })();

  return raceTimeout(work, CROP_TIMEOUT_MS);
}
