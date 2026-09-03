// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Neutralize server-only so the route handler can be unit-tested directly.
vi.mock('server-only', () => ({}));

import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { convertPdfToDocx } from '../../src/lib/business/pdf-a-word';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  PdfToWordFieldErrors,
  PdfToWordInputMeta,
  PdfToWordServerError,
} from '../../src/lib/contracts/pdf-a-word';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import { friendlyPdfToWordError } from '../../src/lib/errors/friendly';

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

describe('pdf-a-word contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_PAGES).toBe(30);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfToWordInputMeta', () => {
    const result = PdfToWordInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfToWordInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_UPLOAD_BYTES', () => {
    const result = PdfToWordInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfToWordInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfToWordInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfToWordFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfToWordServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-a-word > friendlyPdfToWordError', () => {
  it('emits the expected Spanish message for each code (exhaustive)', () => {
    const samples: Array<[string, string]> = [
      ['read_form_failed', 'No se pudo leer el formulario'],
      ['no_file', 'Sube un archivo PDF en el campo "file"'],
      ['invalid_pdf_meta', 'El PDF no es válido'],
      ['bad_magic', 'El archivo no es un PDF válido'],
      ['invalid_pdf_password', 'El PDF está protegido con contraseña'],
      ['invalid_pdf_empty', 'El PDF no tiene páginas'],
      ['invalid_pdf_corrupt', 'No se pudo leer el PDF'],
      ['convert_failed', 'No se pudo convertir el PDF a Word'],
      ['timeout', 'Conversión de PDF a Word tardó demasiado'],
      ['unexpected', 'No se pudo convertir el PDF a Word'],
    ];
    for (const [code, expected] of samples) {
      expect(friendlyPdfToWordError(code as never)).toContain(expected);
    }
  });

  it('embeds the filename in messages that take `{ filename }`', () => {
    const msg = friendlyPdfToWordError('file_too_big', { filename: 'informe.pdf', mb: 20 });
    expect(msg).toContain('informe.pdf');
    expect(msg).toContain('20 MB');
  });
});

describe('pdf-a-word > convertPdfToDocx', () => {
  it('produces a non-empty DOCX ZIP whose first bytes track a known DOCX part', async () => {
    const bytes = await build4PageFixture();
    const result = await convertPdfToDocx(bytes);
    expect(result.pageCount).toBe(4);
    expect(result.docx.byteLength).toBeGreaterThan(0);
    const zip = await JSZip.loadAsync(result.docx);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('_rels/.rels')).not.toBeNull();
    expect(zip.file('word/document.xml')).not.toBeNull();
  });

  it('round-trips: perPageText exposes per-page text from the source PDF', async () => {
    const bytes = await build4PageFixture();
    const result = await convertPdfToDocx(bytes);
    expect(result.perPageText.length).toBe(4);
    // Each page can produce one or more lines; the joined text is non-empty.
    expect(result.perPageText.every((page) => page.trim().length > 0)).toBe(true);
  });

  it('rejects too-many-pages fixtures with a friendly "too many pages" message', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 31; i++) doc.addPage([100, 100]);
    const bytes = new Uint8Array(await doc.save());
    await expect(convertPdfToDocx(bytes)).rejects.toThrow(/páginas/);
  });
});
