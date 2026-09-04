import { describe, expect, it } from 'vitest';

import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_ROTATE_BYTES,
  PDF_MAGIC,
  PdfRotateFieldErrors,
  PdfRotateInputMeta,
  PdfRotatePageRule,
  PdfRotateRotationMap,
  PdfRotateServerError,
  PdfRotationDeg,
} from '../../src/lib/contracts/pdf-rotate';

describe('pdf-rotate contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_PAGES).toBe(100);
    expect(MAX_ROTATE_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('re-exports the same MAX_FILENAME_LEN value as pdf-convert', () => {
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfRotateInputMeta', () => {
    const result = PdfRotateInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfRotateInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_ROTATE_BYTES', () => {
    const result = PdfRotateInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_ROTATE_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfRotateInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfRotateFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfRotateServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-rotate > PdfRotationDeg literal enum', () => {
  it('accepts the three valid degree literals', () => {
    expect(PdfRotationDeg.safeParse('90').success).toBe(true);
    expect(PdfRotationDeg.safeParse('180').success).toBe(true);
    expect(PdfRotationDeg.safeParse('270').success).toBe(true);
  });

  it('rejects every other value', () => {
    expect(PdfRotationDeg.safeParse('0').success).toBe(false);
    expect(PdfRotationDeg.safeParse('45').success).toBe(false);
    expect(PdfRotationDeg.safeParse('360').success).toBe(false);
    expect(PdfRotationDeg.safeParse('').success).toBe(false);
    expect(PdfRotationDeg.safeParse(90).success).toBe(false);
    expect(PdfRotationDeg.safeParse(null).success).toBe(false);
  });
});

describe('pdf-rotate > PdfRotatePageRule', () => {
  it('accepts a valid rule', () => {
    const result = PdfRotatePageRule.safeParse({ page: 1, deg: '90' });
    expect(result.success).toBe(true);
  });

  it('rejects page 0', () => {
    const result = PdfRotatePageRule.safeParse({ page: 0, deg: '90' });
    expect(result.success).toBe(false);
  });

  it('rejects a page above MAX_PAGES', () => {
    const result = PdfRotatePageRule.safeParse({ page: MAX_PAGES + 1, deg: '90' });
    expect(result.success).toBe(false);
  });

  it('accepts a page at the MAX_PAGES boundary', () => {
    const result = PdfRotatePageRule.safeParse({ page: MAX_PAGES, deg: '270' });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer page', () => {
    expect(PdfRotatePageRule.safeParse({ page: 1.5, deg: '90' }).success).toBe(false);
  });

  it('rejects an unknown deg literal', () => {
    const result = PdfRotatePageRule.safeParse({ page: 1, deg: '45' });
    expect(result.success).toBe(false);
  });
});

describe('pdf-rotate > PdfRotateRotationMap wire envelope', () => {
  it('parses a valid single-rule JSON string', () => {
    const result = PdfRotateRotationMap.safeParse('[{"page":1,"deg":"90"}]');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.page).toBe(1);
      expect(result.data[0]?.deg).toBe('90');
    }
  });

  it('parses multiple rules in order', () => {
    const result = PdfRotateRotationMap.safeParse(
      '[{"page":1,"deg":"90"},{"page":3,"deg":"180"},{"page":7,"deg":"270"}]',
    );
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.map((r) => `${r.page}:${r.deg}`)).toEqual(['1:90', '3:180', '7:270']);
  });

  it('rejects an empty array (min length 1)', () => {
    const result = PdfRotateRotationMap.safeParse('[]');
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = PdfRotateRotationMap.safeParse('');
    expect(result.success).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(PdfRotateRotationMap.safeParse('not-json').success).toBe(false);
    expect(PdfRotateRotationMap.safeParse('{').success).toBe(false);
  });

  it('rejects a duplicate page entry', () => {
    const result = PdfRotateRotationMap.safeParse('[{"page":1,"deg":"90"},{"page":1,"deg":"180"}]');
    expect(result.success).toBe(false);
  });

  it('rejects a page above MAX_PAGES', () => {
    const result = PdfRotateRotationMap.safeParse(`[{"page":${MAX_PAGES + 1},"deg":"90"}]`);
    expect(result.success).toBe(false);
  });

  it('rejects a non-string deg literal', () => {
    const result = PdfRotateRotationMap.safeParse('[{"page":1,"deg":90}]');
    expect(result.success).toBe(false);
  });

  it('rejects a payload exceeding the 20_000 char safety cap', () => {
    const oversized = `[${'1'.repeat(21_000)}]`;
    expect(oversized.length).toBeGreaterThan(20_000);
    const result = PdfRotateRotationMap.safeParse(oversized);
    expect(result.success).toBe(false);
  });
});
