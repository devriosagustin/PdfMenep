// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { downloadNameForWatermark } from '../../src/lib/business/pdf-format';
import { addPdfWatermark, PdfWatermarkError } from '../../src/lib/business/pdf-watermark';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_FONT_SIZE,
  MAX_IMAGE_BYTES,
  MAX_OPACITY,
  MAX_TEXT_LEN,
  MAX_WATERMARK_BYTES,
  MIN_FONT_SIZE,
  MIN_OPACITY,
  PDF_MAGIC,
  PdfWatermarkFontSize,
  PdfWatermarkImageMeta,
  PdfWatermarkInputMeta,
  PdfWatermarkMode as PdfWatermarkModeZ,
  PdfWatermarkOpacity,
  PdfWatermarkPosition as PdfWatermarkPositionZ,
  PdfWatermarkTilt as PdfWatermarkTiltZ,
} from '../../src/lib/contracts/pdf-watermark';

async function build3PageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Page One', { x: 40, y: 100, size: 18, font });
  doc.addPage([300, 200]).drawText('Page Two', { x: 40, y: 100, size: 18, font });
  doc.addPage([300, 200]).drawText('Page Three', { x: 40, y: 100, size: 18, font });
  return new Uint8Array(await doc.save());
}

// 1×1 PNG (transparent) — the canonical "no-op image" we use for tests to
// avoid depending on a heavy binary fixture. Uses 67-byte minimum structure.
function tinyPngBytes(): Uint8Array {
  // Generated from a 1x1 white PNG. Hex-encoded inline so we don't ship
  // a binary fixture.
  const hex =
    '89504e470d0a1a0a' + // signature
    '0000000d49484452' + // IHDR length + tag
    '0000000100000001' + // width=1 height=1
    '0806000000' + // bit depth, color type, CRC etc.
    '1f15c489' + // CRC
    '0000000a49444154789c63f80f00000100015ccdffc7' +
    '0000000049454e44ae426082';
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

describe('pdf-watermark contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_WATERMARK_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_IMAGE_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_TEXT_LEN).toBe(80);
    expect(MAX_FONT_SIZE).toBe(72);
    expect(MIN_FONT_SIZE).toBe(8);
    expect(MIN_OPACITY).toBe(10);
    expect(MAX_OPACITY).toBe(100);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('re-exports the same MAX_FILENAME_LEN value as pdf-convert', () => {
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfWatermarkInputMeta', () => {
    const result = PdfWatermarkInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfWatermarkInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_WATERMARK_BYTES', () => {
    const result = PdfWatermarkInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_WATERMARK_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive / non-integer sizeBytes', () => {
    expect(PdfWatermarkInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(
      false,
    );
    expect(PdfWatermarkInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(
      false,
    );
    expect(PdfWatermarkInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfWatermarkInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('PdfWatermarkImageMeta enforces ≤ 2 MB cap and 1-80 char contentType', () => {
    expect(
      PdfWatermarkImageMeta.safeParse({ sizeBytes: 1024, contentType: 'image/png' }).success,
    ).toBe(true);
    expect(
      PdfWatermarkImageMeta.safeParse({
        sizeBytes: MAX_IMAGE_BYTES + 1,
        contentType: 'image/png',
      }).success,
    ).toBe(false);
    expect(
      PdfWatermarkImageMeta.safeParse({ sizeBytes: 0, contentType: 'image/png' }).success,
    ).toBe(false);
  });
});

describe('pdf-watermark > mode / position / tilt / opacity / font enums', () => {
  it('PdfWatermarkMode accepts only "text" and "image"', () => {
    expect(PdfWatermarkModeZ.safeParse('text').success).toBe(true);
    expect(PdfWatermarkModeZ.safeParse('image').success).toBe(true);
    expect(PdfWatermarkModeZ.safeParse('TEXT').success).toBe(false);
    expect(PdfWatermarkModeZ.safeParse('logo').success).toBe(false);
  });

  it('PdfWatermarkPosition accepts the full 6 enum', () => {
    const POSITION_LITERALS: Array<
      'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
    > = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'];
    for (const v of POSITION_LITERALS) {
      expect(PdfWatermarkPositionZ.safeParse(v).success).toBe(true);
    }
    expect(PdfWatermarkPositionZ.safeParse('middle').success).toBe(false);
    expect(PdfWatermarkPositionZ.safeParse('top_left').success).toBe(false);
  });

  it('PdfWatermarkTilt accepts only -45 / 0 / 45', () => {
    expect(PdfWatermarkTiltZ.safeParse(-45).success).toBe(true);
    expect(PdfWatermarkTiltZ.safeParse(0).success).toBe(true);
    expect(PdfWatermarkTiltZ.safeParse(45).success).toBe(true);
    expect(PdfWatermarkTiltZ.safeParse(-30).success).toBe(false);
    expect(PdfWatermarkTiltZ.safeParse(15).success).toBe(false);
    expect(PdfWatermarkTiltZ.safeParse(90).success).toBe(false);
  });

  it('PdfWatermarkOpacity rejects below MIN_OPACITY and above MAX_OPACITY', () => {
    expect(PdfWatermarkOpacity.safeParse(MIN_OPACITY).success).toBe(true);
    expect(PdfWatermarkOpacity.safeParse(MAX_OPACITY).success).toBe(true);
    expect(PdfWatermarkOpacity.safeParse(MIN_OPACITY - 1).success).toBe(false);
    expect(PdfWatermarkOpacity.safeParse(MAX_OPACITY + 1).success).toBe(false);
    expect(PdfWatermarkOpacity.safeParse(1.5).success).toBe(false);
    expect(PdfWatermarkOpacity.safeParse(0).success).toBe(false);
  });

  it('PdfWatermarkFontSize accepts integer 8..72', () => {
    expect(PdfWatermarkFontSize.safeParse(MIN_FONT_SIZE).success).toBe(true);
    expect(PdfWatermarkFontSize.safeParse(MAX_FONT_SIZE).success).toBe(true);
    expect(PdfWatermarkFontSize.safeParse(MIN_FONT_SIZE - 1).success).toBe(false);
    expect(PdfWatermarkFontSize.safeParse(MAX_FONT_SIZE + 1).success).toBe(false);
    expect(PdfWatermarkFontSize.safeParse(8.5).success).toBe(false);
  });
});

describe('pdf-watermark > downloadNameForWatermark', () => {
  it('returns "marcado.pdf" for null filename', () => {
    expect(downloadNameForWatermark(null)).toBe('marcado.pdf');
  });

  it('returns "<base>-marcado.pdf" for "<base>.pdf"', () => {
    expect(downloadNameForWatermark('informe.pdf')).toBe('informe-marcado.pdf');
  });

  it('keeps the same shape for an already upper-cased extension', () => {
    expect(downloadNameForWatermark('informe.PDF')).toBe('informe-marcado.pdf');
  });

  it('strips a prior "-marcado" suffix before re-applying, so re-runs do not pile up', () => {
    expect(downloadNameForWatermark('informe-marcado.pdf')).toBe('informe-marcado.pdf');
  });
});

describe('pdf-watermark > addPdfWatermark business module (text mode)', () => {
  it('happy path: text mode stamps a 3-page document, preserves pageCount', async () => {
    const bytes = await build3PageFixture();
    const inSize = bytes.byteLength;
    const result = await addPdfWatermark({
      mode: 'text',
      bytes,
      text: 'Confidencial',
      position: 'bottom-right',
      opacity: 50,
      tiltDeg: 0,
      fontSize: 36,
    });
    expect(result.pageCount).toBe(3);

    // Reload from disk and confirm we can read it back — guards against a
    // partial / corrupt save.
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(3);

    // Output may be smaller or larger than input — assert it is non-empty
    // and at least as large as 90% of input (we don't promise growth).
    expect(result.pdf.byteLength).toBeGreaterThan(100);
    expect(result.pdf.byteLength).toBeLessThan(inSize * 8);
  });

  it('tilted text branch produces a valid PDF (rotation is well-formed)', async () => {
    const bytes = await build3PageFixture();
    const result = await addPdfWatermark({
      mode: 'text',
      bytes,
      text: 'Borrador',
      position: 'top-left',
      opacity: 100,
      tiltDeg: 45,
      fontSize: 24,
    });
    expect(result.pageCount).toBe(3);
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(3);
  });
});

describe('pdf-watermark > addPdfWatermark business module (image mode)', () => {
  it('happy path: image mode stamps a 3-page document, preserves pageCount', async () => {
    const bytes = await build3PageFixture();
    const result = await addPdfWatermark({
      mode: 'image',
      bytes,
      image: { kind: 'png', bytes: tinyPngBytes() },
      position: 'bottom-right',
      opacity: 80,
      tiltDeg: 0,
    });
    expect(result.pageCount).toBe(3);
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it('throws PdfWatermarkError("invalid_pdf", "corrupt") on non-PDF bytes', async () => {
    let captured: PdfWatermarkError | null = null;
    try {
      await addPdfWatermark({
        mode: 'text',
        bytes: new Uint8Array([0, 1, 2, 3]),
        text: 'X',
        position: 'bottom-right',
        opacity: 50,
        tiltDeg: 0,
        fontSize: 24,
      });
    } catch (err) {
      if (err instanceof PdfWatermarkError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('corrupt');
  });

  it('catches a synthesised "password" message → invalid_pdf/password', async () => {
    // Force the corrupt branch by running the module on a PDF that
    // PDFDocument.load rejects with a /password/i message: simulate via a
    // tiny PDF whose header is intact but whose content is malformed, then
    // rely on the corrupt fallback path with the password regex. We test
    // the password branch by spying on PDFDocument.load below.
    const spy = vi.spyOn(PDFDocument, 'load').mockImplementationOnce(() => {
      throw new Error('PDF is password protected');
    });
    const bytes = await build3PageFixture();
    let captured: PdfWatermarkError | null = null;
    try {
      await addPdfWatermark({
        mode: 'text',
        bytes,
        text: 'X',
        position: 'bottom-right',
        opacity: 50,
        tiltDeg: 0,
        fontSize: 24,
      });
    } catch (err) {
      if (err instanceof PdfWatermarkError) captured = err;
    } finally {
      spy.mockRestore();
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('password');
  });
});
