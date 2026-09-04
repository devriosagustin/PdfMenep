import { describe, expect, it } from 'vitest';

import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_PDF_BYTES,
  PageSelectionRaw,
  PDF_MAGIC,
  PdfSplitFieldErrors,
  PdfSplitInputMeta,
  PdfSplitServerError,
  parsePageSelectionString,
} from '../../src/lib/contracts/pdf-split';
import { friendlySplitError } from '../../src/lib/errors/friendly';

describe('pdf-split contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_PAGES).toBe(100);
    expect(MAX_PDF_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfSplitInputMeta', () => {
    const result = PdfSplitInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfSplitInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_PDF_BYTES', () => {
    const result = PdfSplitInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_PDF_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfSplitInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('parses a field-errors body', () => {
    const result = PdfSplitFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('parses a server-error body', () => {
    const result = PdfSplitServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });

  it('accepts PageSelectionRaw mode=all', () => {
    const result = PageSelectionRaw.safeParse({ mode: 'all' });
    expect(result.success).toBe(true);
  });

  it('accepts PageSelectionRaw mode=pages with a non-empty pagesRaw', () => {
    const result = PageSelectionRaw.safeParse({
      mode: 'pages',
      pagesRaw: '1,3,5-7',
    });
    expect(result.success).toBe(true);
  });

  it('rejects PageSelectionRaw mode=pages with empty pagesRaw', () => {
    const result = PageSelectionRaw.safeParse({ mode: 'pages', pagesRaw: '' });
    expect(result.success).toBe(false);
  });
});

describe('parsePageSelectionString', () => {
  it('parses "1,3,5-7" into [1,3,5,6,7]', () => {
    const r = parsePageSelectionString('1,3,5-7', 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages).toEqual([1, 3, 5, 6, 7]);
  });

  it('tolerates whitespace tokens', () => {
    const r = parsePageSelectionString(' 1 , 3 , 5 - 7 ', 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages).toEqual([1, 3, 5, 6, 7]);
  });

  it('rejects out-of-order ranges ("2-4,1") with code "order"', () => {
    const r = parsePageSelectionString('2-4,1', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('order');
  });

  it('rejects duplicates ("1,1,2") with code "duplicate"', () => {
    const r = parsePageSelectionString('1,1,2', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('duplicate');
  });

  it('rejects page 0 with code "range"', () => {
    const r = parsePageSelectionString('0,2', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('range');
  });

  it('rejects a page above maxPages with code "range"', () => {
    const r = parsePageSelectionString('1,200', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('range');
  });

  it('rejects a range end above maxPages with code "range"', () => {
    const r = parsePageSelectionString('1-50', 20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('range');
  });

  it('rejects reversed ranges ("3-2") with code "order"', () => {
    const r = parsePageSelectionString('3-2', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('order');
  });

  it('rejects non-numeric input with code "parse"', () => {
    const r = parsePageSelectionString('abc', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('parse');
  });

  it('rejects an empty input with code "empty"', () => {
    const r = parsePageSelectionString('', 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('empty');
  });

  it('returns ascending unique pages for a consecutive range', () => {
    const r = parsePageSelectionString('2,3,4', 100);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pages).toEqual([2, 3, 4]);
  });

  it('rejects a selection with more than maxPages entries', () => {
    const r = parsePageSelectionString('1-100', 20);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['range', 'limit']).toContain(r.error);
  });

  it('maps every parse-error code to a Spanish string', () => {
    expect(friendlySplitError('empty_selection', { maxPages: 100 })).toBe(
      'Indica las páginas a extraer (por ejemplo "1,3,5-7") o usa el modo "Todas"',
    );
    expect(friendlySplitError('parse_selection', { maxPages: 100 })).toBe(
      'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
    );
    expect(friendlySplitError('duplicate_selection', { maxPages: 100 })).toBe(
      'Hay páginas repetidas en la selección',
    );
    expect(friendlySplitError('order_selection', { maxPages: 100 })).toBe(
      'Las páginas deben estar en orden ascendente',
    );
    expect(friendlySplitError('out_of_range_selection', { maxPages: 100 })).toBe(
      'Alguna página está fuera del rango 1–100',
    );
    expect(friendlySplitError('selection_limit', { maxPages: 100 })).toBe(
      'Selecciona como máximo 100 páginas',
    );
  });
});
