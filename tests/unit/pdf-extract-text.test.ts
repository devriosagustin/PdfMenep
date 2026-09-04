import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { extractTextFromPdf } from '../../src/lib/business/pdf-extract-text';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  PdfExtractTextFieldErrors,
  PdfExtractTextInputMeta,
  PdfExtractTextServerError,
} from '../../src/lib/contracts/pdf-extract-text';

async function build4PageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const labels = ['Page One', 'Page Two', 'Page Three', 'Page Four'];
  for (const label of labels) {
    const page = doc.addPage([300, 200]);
    page.drawText(label, { x: 40, y: 100, size: 18, font });
  }
  const bytes = await doc.save();
  return new Uint8Array(bytes);
}

describe('pdf-extract-text contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(60 * 1024 * 1024); // PRO ceiling (FREE 20 MB x3)
    expect(MAX_PAGES).toBe(30);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfExtractTextInputMeta', () => {
    const result = PdfExtractTextInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfExtractTextInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_UPLOAD_BYTES', () => {
    const result = PdfExtractTextInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfExtractTextInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(
      false,
    );
    expect(PdfExtractTextInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfExtractTextInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfExtractTextFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfExtractTextServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-extract-text > extractTextFromPdf', () => {
  it('produces a 4-page extraction with the expected per-page text and form-feed separators', async () => {
    const bytes = await build4PageFixture();
    const result = await extractTextFromPdf(bytes);
    expect(result.pageCount).toBe(4);
    const slices = result.text.split('\f');
    expect(slices).toHaveLength(4);
    expect(slices[0]).toMatch(/Page One/);
    expect(slices[1]).toMatch(/Page Two/);
    expect(slices[2]).toMatch(/Page Three/);
    expect(slices[3]).toMatch(/Page Four/);
    expect(result.text.startsWith('\f')).toBe(false);
    expect(result.text.endsWith('\f')).toBe(false);
  });

  it('produces byte-locked output for the 4-page fixture', async () => {
    const bytes = await build4PageFixture();
    const result = await extractTextFromPdf(bytes);
    const expectedParts = ['Page One', 'Page Two', 'Page Three', 'Page Four'];
    const expectedBody = expectedParts.join('\f');
    expect(result.text).toBe(expectedBody);
  });

  it('returns a text/plain-compatible payload that round-trips through UTF-8 encoding', async () => {
    const bytes = await build4PageFixture();
    const result = await extractTextFromPdf(bytes);
    const encoded = new TextEncoder().encode(result.text);
    expect(encoded.byteLength).toBe(result.text.length);
    const decoded = new TextDecoder().decode(encoded);
    expect(decoded).toBe(result.text);
  });
});
