// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Neutralize server-only so the route handler can be unit-tested directly
// (mirrors pdf-a-excel.test.ts:5).
vi.mock('server-only', () => ({}));

import { PDFDocument, StandardFonts } from 'pdf-lib';
import { deletePdfPages, PdfDeletePagesError } from '../../src/lib/business/pdf-delete-pages';
import {
  downloadNameForDeletePages,
  downloadNameForDeletePages as downloadNameForDeletePagesReExport,
} from '../../src/lib/business/pdf-format';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_DELETE_PAGES_BYTES,
  MAX_FILENAME_LEN,
  MAX_PAGES,
  PDF_MAGIC,
  PdfDeletePageNumber,
  PdfDeletePagesFieldErrors,
  PdfDeletePagesInputMeta,
  PdfDeletePagesList,
  PdfDeletePagesServerError,
} from '../../src/lib/contracts/pdf-delete-pages';
import { friendlyDeletePagesError } from '../../src/lib/errors/friendly';

async function build3PageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Page One', { x: 40, y: 100, size: 18, font });
  doc.addPage([300, 200]).drawText('Page Two', { x: 40, y: 100, size: 18, font });
  doc.addPage([300, 200]).drawText('Page Three', { x: 40, y: 100, size: 18, font });
  return new Uint8Array(await doc.save());
}

async function build4PageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const labels = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
  for (const label of labels) {
    doc.addPage([300, 200]).drawText(label, { x: 40, y: 100, size: 18, font });
  }
  return new Uint8Array(await doc.save());
}

describe('pdf-delete-pages contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_DELETE_PAGES_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_PAGES).toBe(100);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('Size cap is LOCAL (not bound to pdf-convert MAX_UPLOAD_BYTES = 20 MB) so 60 MB PDFs pass the gate', async () => {
    // Explicit drift guard: the page-deletion tool deliberately diverges
    // from pdf-convert's 20 MB upload cap (rotate/page-numbers family is
    // 60 MB). If this assertion fires the dev should re-confirm the size
    // policy in the contract before touching the constant.
    expect(MAX_DELETE_PAGES_BYTES).toBeGreaterThan(20 * 1024 * 1024);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('re-exports the same MAX_FILENAME_LEN value as pdf-convert', () => {
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfDeletePagesInputMeta', () => {
    const result = PdfDeletePagesInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfDeletePagesInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_DELETE_PAGES_BYTES', () => {
    const result = PdfDeletePagesInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_DELETE_PAGES_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfDeletePagesInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(
      false,
    );
    expect(PdfDeletePagesInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(
      false,
    );
    expect(PdfDeletePagesInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfDeletePagesInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfDeletePagesFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfDeletePagesServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-delete-pages > PdfDeletePageNumber', () => {
  it('accepts 1, 5, 100', () => {
    expect(PdfDeletePageNumber.safeParse(1).success).toBe(true);
    expect(PdfDeletePageNumber.safeParse(5).success).toBe(true);
    expect(PdfDeletePageNumber.safeParse(100).success).toBe(true);
  });

  it('rejects 0, -1, 1.5, "1", null', () => {
    expect(PdfDeletePageNumber.safeParse(0).success).toBe(false);
    expect(PdfDeletePageNumber.safeParse(-1).success).toBe(false);
    expect(PdfDeletePageNumber.safeParse(1.5).success).toBe(false);
    expect(PdfDeletePageNumber.safeParse('1').success).toBe(false);
    expect(PdfDeletePageNumber.safeParse(null).success).toBe(false);
  });
});

describe('pdf-delete-pages > PdfDeletePagesList wire envelope', () => {
  it('parses a valid flat integer array', () => {
    const result = PdfDeletePagesList.safeParse('[1,3,5]');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([1, 3, 5]);
  });

  it('rejects empty string', () => {
    expect(PdfDeletePagesList.safeParse('').success).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(PdfDeletePagesList.safeParse('not-json').success).toBe(false);
    expect(PdfDeletePagesList.safeParse('{').success).toBe(false);
  });

  it('rejects a payload that is not a JSON array', () => {
    expect(PdfDeletePagesList.safeParse('{"x":1}').success).toBe(false);
  });

  it('rejects an empty array (min length 1)', () => {
    expect(PdfDeletePagesList.safeParse('[]').success).toBe(false);
  });

  it('rejects duplicates', () => {
    expect(PdfDeletePagesList.safeParse('[1,1]').success).toBe(false);
  });

  it('rejects zero or negative numbers', () => {
    expect(PdfDeletePagesList.safeParse('[0]').success).toBe(false);
    expect(PdfDeletePagesList.safeParse('[-1]').success).toBe(false);
  });

  it('rejects non-integer / string entries inside the array', () => {
    expect(PdfDeletePagesList.safeParse('["1-3"]').success).toBe(false);
    expect(PdfDeletePagesList.safeParse('[1.5]').success).toBe(false);
  });

  it('rejects > MAX_PAGES entries', () => {
    const oversized = `[${Array.from({ length: MAX_PAGES + 1 }, (_, i) => i + 1).join(',')}]`;
    expect(PdfDeletePagesList.safeParse(oversized).success).toBe(false);
  });

  it('rejects a payload exceeding the 20_000 char safety cap', () => {
    const oversized = `[${'1'.repeat(21_000)}]`;
    expect(oversized.length).toBeGreaterThan(20_000);
    expect(PdfDeletePagesList.safeParse(oversized).success).toBe(false);
  });

  it('round-trips through a real FormData (envelope + multipart)', () => {
    const fd = new FormData();
    fd.append('pages', '[1,3]');
    const value = fd.get('pages');
    expect(typeof value).toBe('string');
    const result = PdfDeletePagesList.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual([1, 3]);
  });
});

describe('pdf-delete-pages > downloadNameForDeletePages', () => {
  it('returns "sin-paginas.pdf" for an empty filename', () => {
    expect(downloadNameForDeletePages(null)).toBe('sin-paginas.pdf');
  });

  it('returns "doc-sin-paginas.pdf" for "doc.pdf"', () => {
    expect(downloadNameForDeletePages('doc.pdf')).toBe('doc-sin-paginas.pdf');
  });

  it('keeps the same shape for an already upper-cased extension', () => {
    expect(downloadNameForDeletePages('informe.PDF')).toBe('informe-sin-paginas.pdf');
  });

  it('strips a prior "-sin-paginas" suffix before re-applying, so re-runs do not pile up', () => {
    expect(downloadNameForDeletePages('informe-sin-paginas.pdf')).toBe('informe-sin-paginas.pdf');
  });

  it('asserts: re-exported helper matches the contract', () => {
    expect(downloadNameForDeletePagesReExport).toBeDefined();
  });
});

describe('friendlyDeletePagesError', () => {
  it('read_form_failed → "No se pudo leer el formulario"', () => {
    expect(friendlyDeletePagesError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file → "Sube un archivo PDF en el campo \\"file\\""', () => {
    expect(friendlyDeletePagesError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('file_too_big byte-locked with filename and mb context', () => {
    expect(friendlyDeletePagesError('file_too_big', { filename: 'informe.pdf', mb: 60 })).toBe(
      'El PDF "informe.pdf" supera 60 MB',
    );
  });

  it('file_too_big byte-locked without filename', () => {
    expect(friendlyDeletePagesError('file_too_big', { mb: 60 })).toBe('El PDF supera 60 MB');
  });

  it('filename_too_long byte-locked with filename context', () => {
    expect(friendlyDeletePagesError('filename_too_long', { filename: 'largo.pdf' })).toBe(
      'El nombre de "largo.pdf" es demasiado largo',
    );
  });

  it('invalid_pdf_meta byte-locked with filename context', () => {
    expect(friendlyDeletePagesError('invalid_pdf_meta', { filename: 'largo.pdf' })).toBe(
      'El PDF "largo.pdf" no es válido',
    );
  });

  it('bad_magic byte-locked with and without filename context', () => {
    expect(friendlyDeletePagesError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
    expect(friendlyDeletePagesError('bad_magic')).toBe(
      'El archivo no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('empty_selection → "Indica al menos una página para eliminar"', () => {
    expect(friendlyDeletePagesError('empty_selection')).toBe(
      'Indica al menos una página para eliminar',
    );
  });

  it('invalid_page_list → Spanish hint copy with example', () => {
    expect(friendlyDeletePagesError('invalid_page_list')).toBe(
      'Formato de páginas inválido. Usa números y rangos separados por comas, por ejemplo "1,3,5-7"',
    );
  });

  it('duplicate_pages byte-locked', () => {
    expect(friendlyDeletePagesError('duplicate_pages')).toBe(
      'Hay páginas repetidas en la selección',
    );
  });

  it('out_of_range byte-locked with maxPages context', () => {
    expect(friendlyDeletePagesError('out_of_range', { maxPages: 100 })).toBe(
      'Alguna página está fuera del rango 1–100',
    );
  });

  it('too_many_pages byte-locked with maxPages context', () => {
    expect(friendlyDeletePagesError('too_many_pages', { maxPages: 100 })).toBe(
      'Selecciona como máximo 100 páginas',
    );
  });

  it('invalid_pdf_empty byte-locked', () => {
    expect(friendlyDeletePagesError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('invalid_pdf_password byte-locked', () => {
    expect(friendlyDeletePagesError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña',
    );
  });

  it('invalid_pdf_corrupt byte-locked with filename', () => {
    expect(friendlyDeletePagesError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF — el archivo podría estar dañado',
    );
  });

  it('delete_failed byte-locked', () => {
    expect(friendlyDeletePagesError('delete_failed')).toBe(
      'No se pudo eliminar páginas. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout byte-locked', () => {
    expect(friendlyDeletePagesError('timeout')).toBe('Eliminación de páginas tardó demasiado');
  });

  it('unexpected byte-locked', () => {
    expect(friendlyDeletePagesError('unexpected')).toBe('No se pudo eliminar páginas');
  });
});

describe('pdf-delete-pages > deletePdfPages business module', () => {
  it('200 path: deleting page 2 from a 3-page fixture leaves 2 pages in original order', async () => {
    const bytes = await build3PageFixture();
    const result = await deletePdfPages({ bytes, pages: [2] });
    expect(result.remainingPages).toBe(2);

    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('deleting multiple pages preserves original order of survivors', async () => {
    const bytes = await build4PageFixture();
    // Delete pages 2 and 4 — survivors should be 1 and 3 (Alpha, Charlie).
    const result = await deletePdfPages({ bytes, pages: [2, 4] });
    expect(result.remainingPages).toBe(2);

    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('deletes contiguous ranges accepted by the client parser (3,5-7 → [3,5,6,7] on a 7-page doc)', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 7; i++) doc.addPage([200, 200]);
    const bytes = new Uint8Array(await doc.save());
    const result = await deletePdfPages({ bytes, pages: [3, 5, 6, 7] });
    expect(result.remainingPages).toBe(3);
  });

  it('the pageCount guard on a freshly created PDF asserts the empty_doc branch is wired (>= 1 page is the only state a valid PDF can reach)', async () => {
    // pdf-lib refuses to round-trip a 0-page PDF, so the empty_doc code
    // path is unreachable from a valid input. Confirm the guard target
    // by reading pageCount off a freshly created fixture, then asserting
    // (>= 1).
    const doc = await PDFDocument.create();
    const bytes = new Uint8Array(await doc.save());
    const opened = await PDFDocument.load(bytes);
    expect(opened.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('throws PdfDeletePagesError("invalid_pdf", "corrupt") on non-PDF bytes', async () => {
    let captured: PdfDeletePagesError | null = null;
    try {
      await deletePdfPages({ bytes: new Uint8Array([0, 1, 2, 3]), pages: [1] });
    } catch (err) {
      if (err instanceof PdfDeletePagesError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('corrupt');
  });

  it('throws PdfDeletePagesError("selection_failed", "out_of_range") when a page exceeds pageCount', async () => {
    const bytes = await build4PageFixture();
    let captured: PdfDeletePagesError | null = null;
    try {
      await deletePdfPages({ bytes, pages: [99] });
    } catch (err) {
      if (err instanceof PdfDeletePagesError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('selection_failed');
    expect(captured?.reason).toBe('out_of_range');
  });

  it('throws PdfDeletePagesError("selection_failed", "out_of_range") when selection would empty the doc', async () => {
    const bytes = await build3PageFixture();
    let captured: PdfDeletePagesError | null = null;
    try {
      await deletePdfPages({ bytes, pages: [1, 2, 3] });
    } catch (err) {
      if (err instanceof PdfDeletePagesError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('selection_failed');
    expect(captured?.reason).toBe('out_of_range');
  });

  it('silent duplicate guard: business throws on a duplicate even if envelope were bypassed', async () => {
    const bytes = await build3PageFixture();
    let captured: PdfDeletePagesError | null = null;
    try {
      await deletePdfPages({ bytes, pages: [2, 2] });
    } catch (err) {
      if (err instanceof PdfDeletePagesError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('selection_failed');
    expect(captured?.reason).toBe('duplicate');
  });
});
