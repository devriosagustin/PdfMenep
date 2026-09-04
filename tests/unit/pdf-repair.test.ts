// @vitest-environment node
import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Neutralize server-only so the route handler can be unit-tested directly.
vi.mock('server-only', () => ({}));

import { downloadNameForRepair } from '../../src/lib/business/pdf-format';
import { PdfRepairError, repairPdf } from '../../src/lib/business/pdf-repair';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_PASSWORD_LEN,
  MAX_REPAIR_BYTES,
  PDF_MAGIC,
  PdfRepairFieldErrors,
  PdfRepairInputMeta,
  PdfRepairPassword,
  PdfRepairServerError,
} from '../../src/lib/contracts/pdf-repair';
import { friendlyRepairError, type PdfRepairErrorCode } from '../../src/lib/errors/friendly';

async function buildFixture(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([300, 200]);
  const bytes = await doc.save();
  return new Uint8Array(bytes);
}

describe('pdf-repair contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_REPAIR_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
    expect(MAX_PASSWORD_LEN).toBe(64);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfRepairInputMeta', () => {
    const result = PdfRepairInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfRepairInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_REPAIR_BYTES', () => {
    const result = PdfRepairInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_REPAIR_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfRepairInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfRepairFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfRepairServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });

  it('PdfRepairPassword accepts empty / short values (optional, length ≤ MAX_PASSWORD_LEN)', () => {
    expect(PdfRepairPassword.safeParse(undefined).success).toBe(true);
    expect(PdfRepairPassword.safeParse('').success).toBe(true);
    expect(PdfRepairPassword.safeParse('A'.repeat(64)).success).toBe(true);
    expect(PdfRepairPassword.safeParse('A'.repeat(65)).success).toBe(false);
  });
});

describe('pdf-repair > downloadNameForRepair', () => {
  it('returns "repaired.pdf" for empty filename', () => {
    expect(downloadNameForRepair(null)).toBe('repaired.pdf');
  });

  it('returns "doc-repaired.pdf" for a bare "doc.pdf"', () => {
    expect(downloadNameForRepair('doc.pdf')).toBe('doc-repaired.pdf');
  });

  it('handles an already-tweaked name', () => {
    expect(downloadNameForRepair('myfile.PDF')).toBe('myfile-repaired.pdf');
  });
});

describe('friendlyRepairError', () => {
  const codes: PdfRepairErrorCode[] = [
    'read_form_failed',
    'no_file',
    'file_too_big',
    'filename_too_long',
    'invalid_pdf_meta',
    'bad_magic',
    'password_too_long',
    'invalid_pdf_empty',
    'invalid_pdf_password',
    'invalid_pdf_corrupt',
    'repair_failed',
    'timeout',
    'unexpected',
  ];

  it('returns a non-empty Spanish string for every error code', () => {
    for (const code of codes) {
      expect(typeof friendlyRepairError(code)).toBe('string');
      expect(friendlyRepairError(code).length).toBeGreaterThan(0);
    }
  });

  it('substitutes the filename into messages that name a file', () => {
    expect(friendlyRepairError('file_too_big', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyRepairError('bad_magic', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyRepairError('invalid_pdf_corrupt', { filename: 'doc.pdf' })).toContain(
      'doc.pdf',
    );
  });

  it('exposes the byte-locked Spanish copy for each status code', () => {
    expect(friendlyRepairError('read_form_failed')).toBe('No se pudo leer el formulario');
    expect(friendlyRepairError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
    expect(friendlyRepairError('filename_too_long', { filename: 'a.pdf' })).toBe(
      'El nombre de "a.pdf" es demasiado largo',
    );
    expect(friendlyRepairError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
    expect(friendlyRepairError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
    expect(friendlyRepairError('password_too_long', { maxChars: 64 })).toBe(
      'La contraseña debe tener como máximo 64 caracteres',
    );
    expect(friendlyRepairError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
    expect(friendlyRepairError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña. Quita la contraseña para repararlo',
    );
    expect(friendlyRepairError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF — el archivo podría estar dañado',
    );
    expect(friendlyRepairError('repair_failed')).toBe(
      'No se pudo reparar el PDF. Inténtalo de nuevo con otro archivo',
    );
    expect(friendlyRepairError('timeout')).toBe('Reparación de PDF tardó demasiado');
    expect(friendlyRepairError('unexpected')).toBe('No se pudo reparar el PDF');
  });
});

describe('pdf-repair > repairPdf business module', () => {
  it('round-trips a 1-page valid PDF and the output re-loads via pdf-lib', async () => {
    const src = await buildFixture(1);
    const result = await repairPdf({ bytes: src });
    expect(result.pdf.byteLength).toBeGreaterThan(0);
    expect(result.pageCount).toBe(1);
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('round-trips a 2-page valid PDF', async () => {
    const src = await buildFixture(2);
    const result = await repairPdf({ bytes: src });
    expect(result.pageCount).toBe(2);
    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('rejects empty input via PdfRepairError("invalid_pdf", "corrupt")', async () => {
    let captured: PdfRepairError | null = null;
    try {
      await repairPdf({ bytes: new Uint8Array([0, 1, 2, 3]) });
    } catch (err) {
      if (err instanceof PdfRepairError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('corrupt');
  });

  it('accepts a password when provided (does not throw on a fixture without encryption)', async () => {
    const src = await buildFixture(1);
    const result = await repairPdf({ bytes: src, password: 'whatever' });
    expect(result.pageCount).toBe(1);
  });
});

describe('pdf-repair > POST /api/pdf/repair route handler', () => {
  let POST: typeof import('../../src/app/api/pdf/repair/route').POST;

  beforeAll(async () => {
    const mod = await import('../../src/app/api/pdf/repair/route');
    POST = mod.POST;
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  function buildMultipart(input: { bytes: Uint8Array; filename: string; password?: string }) {
    const form = new FormData();
    form.append('file', new Blob([input.bytes]), input.filename);
    if (input.password !== undefined) form.append('password', input.password);
    return form;
  }

  it('returns 200 application/pdf with an x-pages header for a 2-page fixture', async () => {
    const bytes = await buildFixture(2);
    const req = new Request('http://test/api/pdf/repair', {
      method: 'POST',
      body: buildMultipart({ bytes, filename: 'doc.pdf' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-pages')).toBe('2');
    const outputBytes = new Uint8Array(await res.arrayBuffer());
    const reloaded = await PDFDocument.load(outputBytes);
    expect(reloaded.getPageCount()).toBe(2);
  });

  it('returns 400 + bad_magic when the magic prefix is wrong', async () => {
    const req = new Request('http://test/api/pdf/repair', {
      method: 'POST',
      body: buildMultipart({ bytes: new Uint8Array([1, 2, 3, 4, 5]), filename: 'doc.pdf' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.file).toBe(friendlyRepairError('bad_magic', { filename: 'doc.pdf' }));
  });

  it('returns 400 + no_file when the file field is missing', async () => {
    const form = new FormData();
    const req = new Request('http://test/api/pdf/repair', {
      method: 'POST',
      body: form,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.file).toBe(friendlyRepairError('no_file'));
  });

  it('returns 400 + password_too_long when the password exceeds MAX_PASSWORD_LEN', async () => {
    const bytes = await buildFixture(1);
    const req = new Request('http://test/api/pdf/repair', {
      method: 'POST',
      body: buildMultipart({
        bytes,
        filename: 'doc.pdf',
        password: 'A'.repeat(MAX_PASSWORD_LEN + 1),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.password).toBe(
      friendlyRepairError('password_too_long', { maxChars: MAX_PASSWORD_LEN }),
    );
  });

  it('returns 400 + filename_too_long when the filename exceeds MAX_FILENAME_LEN', async () => {
    const bytes = await buildFixture(1);
    const longName = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const req = new Request('http://test/api/pdf/repair', {
      method: 'POST',
      body: buildMultipart({ bytes, filename: longName }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.file).toBe(friendlyRepairError('filename_too_long', { filename: longName }));
  });
});
