import { describe, expect, it } from 'vitest';

import {
  MAX_FILENAME_LEN,
  MAX_PDFS,
  MAX_PER_FILE_BYTES,
  MAX_TOTAL_BYTES,
  PDF_MAGIC,
  PdfMergeFieldErrors,
  PdfMergeInputMeta,
} from '../../src/lib/contracts/pdf-merge';

describe('pdf-merge contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_PDFS).toBe(30); // PRO ceiling (FREE 10 x3)
    expect(MAX_PER_FILE_BYTES).toBe(60 * 1024 * 1024); // PRO ceiling (FREE 20 MB x3)
    expect(MAX_TOTAL_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfMergeInputMeta', () => {
    const result = PdfMergeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfMergeInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_PER_FILE_BYTES', () => {
    const result = PdfMergeInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_PER_FILE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfMergeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfMergeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfMergeInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('parses a field-errors body', () => {
    const result = PdfMergeFieldErrors.safeParse({ errors: { files: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.files).toBe('bad');
  });
});
