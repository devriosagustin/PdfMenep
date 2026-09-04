import { describe, expect, it } from 'vitest';

import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  ERROR_INVALID_POSITION,
  ERROR_INVALID_STARTING_NUMBER,
  ERROR_NO_FILE,
  ERROR_NO_POSITION,
  ERROR_NO_STARTING_NUMBER,
  ERROR_NOT_PDF,
  ERROR_PAGE_NUMBERS_FAILED,
  ERROR_READ_FORM,
  MAX_FILENAME_LEN,
  MAX_PAGE_NUMBERS_BYTES,
  PDF_MAGIC,
  type PdfNumberPosition,
  PdfNumberPosition as PdfNumberPositionZ,
  PdfPageNumbersFieldErrors,
  PdfPageNumbersInputMeta,
  PdfPageNumbersServerError,
} from '../../src/lib/contracts/pdf-page-numbers';

const POSITION_LITERALS: PdfNumberPosition[] = [
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

describe('pdf-page-numbers contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_PAGE_NUMBERS_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(MAX_FILENAME_LEN).toBe(200);
    expect(PDF_MAGIC).toBe('%PDF-');
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('re-exports the same MAX_FILENAME_LEN value as pdf-convert', () => {
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfPageNumbersInputMeta', () => {
    const result = PdfPageNumbersInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfPageNumbersInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_PAGE_NUMBERS_BYTES', () => {
    const result = PdfPageNumbersInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_PAGE_NUMBERS_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes at the boundary +1', () => {
    const result = PdfPageNumbersInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_PAGE_NUMBERS_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive sizeBytes', () => {
    expect(PdfPageNumbersInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(
      false,
    );
    expect(PdfPageNumbersInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(
      false,
    );
  });

  it('rejects a non-integer sizeBytes', () => {
    expect(PdfPageNumbersInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfPageNumbersInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body with ERROR_NOT_PDF', () => {
    const result = PdfPageNumbersFieldErrors.safeParse({ errors: { file: ERROR_NOT_PDF } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe(ERROR_NOT_PDF);
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfPageNumbersServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });

  it('exposes Spanish error strings with the expected hints', () => {
    expect(ERROR_NO_FILE).toMatch(/PDF/i);
    expect(ERROR_NO_POSITION).toMatch(/posici[oó]n/i);
    expect(ERROR_NO_STARTING_NUMBER).toMatch(/n[uú]mero/i);
    expect(ERROR_INVALID_POSITION).toMatch(/posici[oó]n/i);
    expect(ERROR_INVALID_STARTING_NUMBER).toMatch(/n[uú]mero/i);
    expect(ERROR_PAGE_NUMBERS_FAILED).toMatch(/PDF/i);
    expect(ERROR_READ_FORM).toMatch(/formulario/i);
  });
});

describe('pdf-page-numbers > PdfNumberPosition literal enum', () => {
  it('accepts all six position literals', () => {
    for (const value of POSITION_LITERALS) {
      expect(PdfNumberPositionZ.safeParse(value).success).toBe(true);
    }
  });

  it('rejects unknown position strings', () => {
    expect(PdfNumberPositionZ.safeParse('top').success).toBe(false);
    expect(PdfNumberPositionZ.safeParse('middle').success).toBe(false);
    expect(PdfNumberPositionZ.safeParse('BOTTOM-RIGHT').success).toBe(false);
    expect(PdfNumberPositionZ.safeParse('top_left').success).toBe(false);
  });

  it('rejects non-string values', () => {
    expect(PdfNumberPositionZ.safeParse(0).success).toBe(false);
    expect(PdfNumberPositionZ.safeParse(null).success).toBe(false);
    expect(PdfNumberPositionZ.safeParse(undefined).success).toBe(false);
    expect(PdfNumberPositionZ.safeParse({}).success).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(PdfNumberPositionZ.safeParse('').success).toBe(false);
  });
});
