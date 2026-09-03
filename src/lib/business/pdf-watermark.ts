import 'server-only';
import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rotateRadians,
  StandardFonts,
  translate,
} from 'pdf-lib';

import type { PdfWatermarkPosition, PdfWatermarkTilt } from '@/lib/contracts/pdf-watermark';

export class PdfWatermarkError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'watermark_failed'
      | 'empty_doc'
      | 'timeout'
      | 'invalid_image',
    public readonly reason?: 'password' | 'corrupt',
  ) {
    super();
  }
}

export type PdfWatermarkInput =
  | {
      mode: 'text';
      bytes: Uint8Array;
      text: string;
      position: PdfWatermarkPosition;
      opacity: number;
      tiltDeg: PdfWatermarkTilt;
      fontSize: number;
    }
  | {
      mode: 'image';
      bytes: Uint8Array;
      image: { kind: 'png' | 'jpg'; bytes: Uint8Array };
      position: PdfWatermarkPosition;
      opacity: number;
      tiltDeg: PdfWatermarkTilt;
    };

export interface PdfWatermarkResult {
  pdf: Uint8Array;
  pageCount: number;
}

const WATERMARK_TIMEOUT_MS = 40_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfWatermarkError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

interface XY {
  x: number;
  y: number;
}

// Mirror of `pdf-page-numbers.ts` computePosition: top vs bottom row, and
// left/center/right within the row. margin = 24 keeps the same visual
// breathing room as the page-number stamper.
function computePosition(
  position: PdfWatermarkPosition,
  width: number,
  height: number,
  drawWidth: number,
  drawHeight: number,
  margin: number,
): XY {
  let x = margin;
  if (position.endsWith('-center')) {
    x = (width - drawWidth) / 2;
  } else if (position.endsWith('-right')) {
    x = width - drawWidth - margin;
  }
  const y = position.startsWith('top-') ? height - drawHeight - margin : margin;
  return { x, y };
}

function tiltAngleRadians(tiltDeg: PdfWatermarkTilt): number {
  if (tiltDeg === 0) return 0;
  return (tiltDeg * Math.PI) / 180;
}

export async function addPdfWatermark(input: PdfWatermarkInput): Promise<PdfWatermarkResult> {
  return raceTimeout(work(input), WATERMARK_TIMEOUT_MS);
}

async function work(input: PdfWatermarkInput): Promise<PdfWatermarkResult> {
  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/password/i.test(msg)) {
      throw new PdfWatermarkError('invalid_pdf', 'password');
    }
    throw new PdfWatermarkError('invalid_pdf', 'corrupt');
  }

  const pages = src.getPages();
  if (pages.length === 0) {
    throw new PdfWatermarkError('empty_doc');
  }

  try {
    const margin = 24;
    const opacity = Math.max(0, Math.min(1, input.opacity / 100));
    const tiltRad = tiltAngleRadians(input.tiltDeg);
    const hasTilt = tiltRad !== 0;

    if (input.mode === 'text') {
      const font = await src.embedFont(StandardFonts.Helvetica);
      for (const page of pages) {
        const { width, height } = page.getSize();
        const textWidth = font.widthOfTextAtSize(input.text, input.fontSize);
        const textHeight = input.fontSize;
        const { x, y } = computePosition(
          input.position,
          width,
          height,
          textWidth,
          textHeight,
          margin,
        );
        if (hasTilt) {
          // Rotate around the page center: shift origin from (0,0) to
          // (-W/2, -H/2), rotate, then re-translate after drawing.
          page.pushOperators(
            pushGraphicsState(),
            rotateRadians(tiltRad),
            translate(-width / 2, -height / 2),
          );
          page.drawText(input.text, {
            x: x + width / 2,
            y: y + height / 2,
            size: input.fontSize,
            font,
            opacity,
          });
          page.pushOperators(translate(width / 2, height / 2), popGraphicsState());
        } else {
          page.drawText(input.text, {
            x,
            y,
            size: input.fontSize,
            font,
            opacity,
          });
        }
      }
    } else {
      const embedded =
        input.image.kind === 'png'
          ? await src.embedPng(input.image.bytes)
          : await src.embedJpg(input.image.bytes);
      for (const page of pages) {
        const { width: pageW, height: pageH } = page.getSize();
        const fitMax = Math.min(pageW, pageH) * 0.35;
        const scaled = embedded.scaleToFit(fitMax, fitMax);
        const { x, y } = computePosition(
          input.position,
          pageW,
          pageH,
          scaled.width,
          scaled.height,
          margin,
        );
        if (hasTilt) {
          page.pushOperators(
            pushGraphicsState(),
            rotateRadians(tiltRad),
            translate(-pageW / 2, -pageH / 2),
          );
          page.drawImage(embedded, {
            x: x + pageW / 2,
            y: y + pageH / 2,
            width: scaled.width,
            height: scaled.height,
            opacity,
          });
          page.pushOperators(translate(pageW / 2, pageH / 2), popGraphicsState());
        } else {
          page.drawImage(embedded, {
            x,
            y,
            width: scaled.width,
            height: scaled.height,
            opacity,
          });
        }
      }
    }

    const pdf = await src.save();
    return { pdf, pageCount: pages.length };
  } catch (err) {
    if (err instanceof PdfWatermarkError) throw err;
    throw new PdfWatermarkError('watermark_failed');
  }
}
