// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Neutralize server-only so the route handler can be unit-tested directly.
vi.mock('server-only', () => ({}));

import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import { convertPdfToXlsx } from '../../src/lib/business/pdf-a-excel';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
  PDF_MAGIC,
  PdfToExcelFieldErrors,
  PdfToExcelInputMeta,
  PdfToExcelServerError,
} from '../../src/lib/contracts/pdf-a-excel';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import { friendlyPdfToExcelError } from '../../src/lib/errors/friendly';

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

describe('pdf-a-excel contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_UPLOAD_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_PAGES).toBe(30);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfToExcelInputMeta', () => {
    const result = PdfToExcelInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfToExcelInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_UPLOAD_BYTES', () => {
    const result = PdfToExcelInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_UPLOAD_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfToExcelInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfToExcelInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfToExcelFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfToExcelServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-a-excel > friendlyPdfToExcelError', () => {
  it('emits the expected Spanish message for each code (exhaustive)', () => {
    const samples: Array<[string, string]> = [
      ['read_form_failed', 'No se pudo leer el formulario'],
      ['no_file', 'Sube un archivo PDF en el campo "file"'],
      ['invalid_pdf_meta', 'El PDF no es válido'],
      ['bad_magic', 'El archivo no es un PDF válido'],
      ['invalid_pdf_password', 'El PDF está protegido con contraseña'],
      ['invalid_pdf_empty', 'El PDF no tiene páginas'],
      ['invalid_pdf_corrupt', 'No se pudo leer el PDF'],
      ['convert_failed', 'No se pudo convertir el PDF a Excel'],
      ['timeout', 'Conversión de PDF a Excel tardó demasiado'],
      ['unexpected', 'No se pudo convertir el PDF a Excel'],
    ];
    for (const [code, expected] of samples) {
      expect(friendlyPdfToExcelError(code as never)).toContain(expected);
    }
  });

  it('embeds the filename in messages that take `{ filename }`', () => {
    const msg = friendlyPdfToExcelError('file_too_big', { filename: 'informe.pdf', mb: 20 });
    expect(msg).toContain('informe.pdf');
    expect(msg).toContain('20 MB');
  });
});

describe('pdf-a-excel > convertPdfToXlsx', () => {
  it('produces a non-empty XLSX ZIP whose parts follow the OOXML contract', async () => {
    const bytes = await build4PageFixture();
    const result = await convertPdfToXlsx(bytes);
    expect(result.pageCount).toBe(4);
    expect(result.xlsx.byteLength).toBeGreaterThan(0);
    expect(result.rowCount).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(result.xlsx);
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
    expect(zip.file('_rels/.rels')).not.toBeNull();
    expect(zip.file('xl/workbook.xml')).not.toBeNull();
    expect(zip.file('xl/_rels/workbook.xml.rels')).not.toBeNull();
    expect(zip.file('xl/worksheets/sheet1.xml')).not.toBeNull();
  });

  it('embeds per-page text in the worksheet xml when the source PDF has multi-line text', async () => {
    // Build a 2-page fixture where page 1 has two lines and page 2 has one.
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page1 = doc.addPage([400, 200]);
    page1.drawText('Page One Line A', { x: 40, y: 140, size: 18, font });
    page1.drawText('Page One Line B', { x: 40, y: 100, size: 18, font });
    const page2 = doc.addPage([400, 200]);
    page2.drawText('Page Two Marker', { x: 40, y: 100, size: 18, font });
    const bytes = new Uint8Array(await doc.save());

    const xlsx = await convertPdfToXlsx(bytes);
    const zip = await JSZip.loadAsync(xlsx.xlsx);
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    expect(sheetFile).not.toBeNull();
    const workbookFile = zip.file('xl/workbook.xml');
    expect(workbookFile).not.toBeNull();

    const xml = await sheetFile?.async('string');
    const workbookXml = await workbookFile?.async('string');
    if (!xml || !workbookXml) {
      throw new Error('sheet1.xml or workbook.xml missing');
    }

    expect(xlsx.pageCount).toBe(2);
    expect(xml).toContain('<sheetData>');
    expect(workbookXml).toContain('Hoja1');
    // Per-line text chunks map into the inline string cells.
    expect(xml).toContain('Página 1');
    expect(xml).toContain('Página 2');
    expect(xml).toContain('Page One Line A');
    expect(xml).toContain('Page One Line B');
    expect(xml).toContain('Page Two Marker');
  });

  it('rejects too-many-pages fixtures with a friendly "too many pages" message', async () => {
    const doc = await PDFDocument.create();
    for (let i = 0; i < 31; i++) doc.addPage([100, 100]);
    const bytes = new Uint8Array(await doc.save());
    await expect(convertPdfToXlsx(bytes)).rejects.toThrow(/páginas/);
  });
});
