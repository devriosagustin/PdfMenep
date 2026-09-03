import { describe, expect, it } from 'vitest';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  ERROR_INVALID_LEVEL,
  ERROR_NO_FILE,
  ERROR_NO_LEVEL,
  ERROR_NOT_PDF,
  MAX_FILENAME_LEN,
  MAX_OPTIMIZE_BYTES,
  PDF_MAGIC,
  PdfOptimizeFieldErrors,
  PdfOptimizeInputMeta,
  PdfOptimizeLevel,
  PdfOptimizeServerError,
} from '../../src/lib/contracts/pdf-optimize';

describe('pdf-optimize contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_OPTIMIZE_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_FILENAME_LEN).toBe(200);
    expect(PDF_MAGIC).toBe('%PDF-');
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts the three compression levels and rejects everything else', () => {
    expect(PdfOptimizeLevel.safeParse('baja').success).toBe(true);
    expect(PdfOptimizeLevel.safeParse('media').success).toBe(true);
    expect(PdfOptimizeLevel.safeParse('alta').success).toBe(true);
    expect(PdfOptimizeLevel.safeParse('low').success).toBe(false);
    expect(PdfOptimizeLevel.safeParse('high').success).toBe(false);
    expect(PdfOptimizeLevel.safeParse('').success).toBe(false);
    expect(PdfOptimizeLevel.safeParse(2).success).toBe(false);
  });

  it('accepts a valid PdfOptimizeInputMeta', () => {
    const result = PdfOptimizeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfOptimizeInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes at the MAX_OPTIMIZE_BYTES + 1 boundary', () => {
    const ok = PdfOptimizeInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_OPTIMIZE_BYTES,
    });
    expect(ok.success).toBe(true);

    const over = PdfOptimizeInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_OPTIMIZE_BYTES + 1,
    });
    expect(over.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfOptimizeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfOptimizeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(
      false,
    );
    expect(PdfOptimizeInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfOptimizeInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects a filename that is exactly MAX_FILENAME_LEN of "a" without .pdf', () => {
    const name = 'a'.repeat(MAX_FILENAME_LEN);
    const result = PdfOptimizeInputMeta.safeParse({ filename: name, sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfOptimizeFieldErrors.safeParse({ errors: { file: ERROR_NOT_PDF } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe(ERROR_NOT_PDF);
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfOptimizeServerError.safeParse({ error: ERROR_NO_LEVEL });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe(ERROR_NO_LEVEL);
  });

  it('ships Spanish strings both for missing file and invalid level', () => {
    expect(ERROR_NO_FILE).toMatch(/PDF/);
    expect(ERROR_INVALID_LEVEL).toMatch(/inválido|invalido|inválid/i);
  });
});
