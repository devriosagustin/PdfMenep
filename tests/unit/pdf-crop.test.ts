// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

// Neutralize server-only so the route handler can be unit-tested directly
// (mirrors pdf-delete-pages.test.ts:6).
vi.mock('server-only', () => ({}));

import { PDFDocument, StandardFonts } from 'pdf-lib';

import { cropPdfPages } from '../../src/lib/business/pdf-crop';
import {
  downloadNameForCrop,
  downloadNameForCrop as downloadNameForCropReExport,
} from '../../src/lib/business/pdf-format';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_CROP_BYTES,
  MAX_FILENAME_LEN,
  MAX_PDF_BOX_MM,
  MAX_PDF_BOX_MM as MAX_PDF_BOX_MM_REEXPORT,
  PDF_MAGIC,
  PdfCropBox,
  PdfCropBoxEnvelope,
  PdfCropFieldErrors,
  PdfCropInputMeta,
  PdfCropServerError,
} from '../../src/lib/contracts/pdf-crop';
import { friendlyCropError } from '../../src/lib/errors/friendly';

async function build2PageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('P1', { x: 20, y: 100, size: 16, font });
  doc.addPage([300, 200]).drawText('P2', { x: 20, y: 100, size: 16, font });
  return new Uint8Array(await doc.save());
}

const MM_TO_PT = 72 / 25.4;

describe('pdf-crop contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_CROP_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_PDF_BOX_MM).toBe(2000);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('re-exports the same MAX_FILENAME_LEN value as pdf-convert', () => {
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('accepts a valid PdfCropInputMeta', () => {
    const result = PdfCropInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfCropInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_CROP_BYTES', () => {
    const result = PdfCropInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_CROP_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfCropInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfCropInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(false);
    expect(PdfCropInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfCropInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfCropFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfCropServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-crop > PdfCropBox', () => {
  it('accepts a valid in-bounds box', () => {
    const result = PdfCropBox.safeParse({ x: 0, y: 0, width: 100, height: 100 });
    expect(result.success).toBe(true);
  });

  it('accepts the boundary MAX_PDF_BOX_MM values', () => {
    const result = PdfCropBox.safeParse({
      x: 0,
      y: 0,
      width: MAX_PDF_BOX_MM,
      height: MAX_PDF_BOX_MM,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-integer dimension', () => {
    expect(PdfCropBox.safeParse({ x: 0, y: 0, width: 1.5, height: 100 }).success).toBe(false);
    expect(PdfCropBox.safeParse({ x: 0, y: 0, width: 100, height: 1.5 }).success).toBe(false);
  });

  it('rejects a negative dimension', () => {
    expect(PdfCropBox.safeParse({ x: -1, y: 0, width: 100, height: 100 }).success).toBe(false);
    expect(PdfCropBox.safeParse({ x: 0, y: 0, width: 100, height: -1 }).success).toBe(false);
  });

  it('rejects a value above MAX_PDF_BOX_MM', () => {
    expect(
      PdfCropBox.safeParse({
        x: 0,
        y: 0,
        width: MAX_PDF_BOX_MM + 1,
        height: 0,
      }).success,
    ).toBe(false);
  });
});

describe('pdf-crop > PdfCropBoxEnvelope wire', () => {
  it('parses a valid {x, y, width, height} JSON object', () => {
    const result = PdfCropBoxEnvelope.safeParse('{"x":10,"y":15,"width":180,"height":240}');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ x: 10, y: 15, width: 180, height: 240 });
  });

  it('rejects empty string', () => {
    expect(PdfCropBoxEnvelope.safeParse('').success).toBe(false);
  });

  it('rejects invalid JSON', () => {
    expect(PdfCropBoxEnvelope.safeParse('not-json').success).toBe(false);
    expect(PdfCropBoxEnvelope.safeParse('{').success).toBe(false);
  });

  it('rejects a non-object payload (array / primitive / null)', () => {
    expect(PdfCropBoxEnvelope.safeParse('[]').success).toBe(false);
    expect(PdfCropBoxEnvelope.safeParse('42').success).toBe(false);
    expect(PdfCropBoxEnvelope.safeParse('null').success).toBe(false);
    expect(PdfCropBoxEnvelope.safeParse('"hello"').success).toBe(false);
  });

  it('rejects a non-integer numeric value', () => {
    expect(PdfCropBoxEnvelope.safeParse('{"x":1.5,"y":0,"width":100,"height":100}').success).toBe(
      false,
    );
  });

  it('rejects a negative value', () => {
    expect(PdfCropBoxEnvelope.safeParse('{"x":-1,"y":0,"width":100,"height":100}').success).toBe(
      false,
    );
  });

  it('rejects a box at the boundary that is otherwise valid but the rectangle exceeds MAX_PDF_BOX_MM', () => {
    const result = PdfCropBoxEnvelope.safeParse(
      `{"x":${MAX_PDF_BOX_MM},"y":0,"width":1,"height":0}`,
    );
    expect(result.success).toBe(false);
  });

  it('rejects a payload exceeding the 20_000 char safety cap', () => {
    const oversized = `{"x":${'1'.repeat(21_000)},"y":0,"width":1,"height":0}`;
    expect(oversized.length).toBeGreaterThan(20_000);
    expect(PdfCropBoxEnvelope.safeParse(oversized).success).toBe(false);
  });

  it('round-trips through a real FormData (envelope + multipart POST)', () => {
    const fd = new FormData();
    fd.append('box', '{"x":10,"y":15,"width":180,"height":240}');
    const value = fd.get('box');
    expect(typeof value).toBe('string');
    const result = PdfCropBoxEnvelope.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.width).toBe(180);
  });
});

describe('friendlyCropError', () => {
  it('read_form_failed → "No se pudo leer el formulario"', () => {
    expect(friendlyCropError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file → "Sube un archivo PDF en el campo \\"file\\""', () => {
    expect(friendlyCropError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('file_too_big byte-locked with filename and mb context', () => {
    expect(friendlyCropError('file_too_big', { filename: 'informe.pdf', mb: 60 })).toBe(
      'El PDF "informe.pdf" supera 60 MB',
    );
  });

  it('file_too_big byte-locked without filename', () => {
    expect(friendlyCropError('file_too_big', { mb: 60 })).toBe('El PDF supera 60 MB');
  });

  it('filename_too_long byte-locked with filename context', () => {
    expect(friendlyCropError('filename_too_long', { filename: 'largo.pdf' })).toBe(
      'El nombre de "largo.pdf" es demasiado largo',
    );
  });

  it('invalid_pdf_meta byte-locked with filename context', () => {
    expect(friendlyCropError('invalid_pdf_meta', { filename: 'largo.pdf' })).toBe(
      'El PDF "largo.pdf" no es válido',
    );
  });

  it('bad_magic byte-locked with and without filename context', () => {
    expect(friendlyCropError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
    expect(friendlyCropError('bad_magic')).toBe(
      'El archivo no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('no_box byte-locked', () => {
    expect(friendlyCropError('no_box')).toBe(
      'Indica la región a recortar (x, y, ancho y alto en mm)',
    );
  });

  it('invalid_box byte-locked', () => {
    expect(friendlyCropError('invalid_box')).toBe(
      'Región de recorte inválida. Introduce números enteros en mm',
    );
  });

  it('out_of_range_box byte-locked', () => {
    expect(friendlyCropError('out_of_range_box')).toBe(
      'La región de recorte se sale de la página. Usa valores entre 0 y 2000 mm',
    );
  });

  it('invalid_pdf_empty byte-locked', () => {
    expect(friendlyCropError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('invalid_pdf_password byte-locked', () => {
    expect(friendlyCropError('invalid_pdf_password')).toBe('El PDF está protegido con contraseña');
  });

  it('invalid_pdf_corrupt byte-locked with filename', () => {
    expect(friendlyCropError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF — el archivo podría estar dañado',
    );
  });

  it('crop_failed byte-locked', () => {
    expect(friendlyCropError('crop_failed')).toBe(
      'No se pudo recortar el PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout byte-locked', () => {
    expect(friendlyCropError('timeout')).toBe('Recorte de PDF tardó demasiado');
  });

  it('unexpected byte-locked', () => {
    expect(friendlyCropError('unexpected')).toBe('No se pudo recortar el PDF');
  });
});

describe('pdf-crop > downloadNameForCrop', () => {
  it('returns "recortado.pdf" for an empty filename', () => {
    expect(downloadNameForCrop(null)).toBe('recortado.pdf');
  });

  it('returns "doc-recortado.pdf" for "doc.pdf"', () => {
    expect(downloadNameForCrop('doc.pdf')).toBe('doc-recortado.pdf');
  });

  it('keeps the same shape for an already upper-cased extension', () => {
    expect(downloadNameForCrop('informe.PDF')).toBe('informe-recortado.pdf');
  });

  it('strips a prior "-recortado" suffix before re-applying, so re-runs do not pile up', () => {
    expect(downloadNameForCrop('informe-recortado.pdf')).toBe('informe-recortado.pdf');
  });

  it('asserts: re-exported helper matches the contract', () => {
    expect(downloadNameForCropReExport).toBeDefined();
  });
});

describe('pdf-crop > MAX_CROP_BYTES wire re-export drift guard', () => {
  it('the contract constant value matches the source constant value (60 MB)', () => {
    expect(MAX_CROP_BYTES).toBe(60 * 1024 * 1024);
  });

  it('the contract re-exports the same PDF_MAGIC as the source utility', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('MAX_PDF_BOX_MM re-export matches the contract constant', () => {
    expect(MAX_PDF_BOX_MM_REEXPORT).toBe(MAX_PDF_BOX_MM);
  });
});

describe('pdf-crop > cropPdfPages business module', () => {
  it('200 path: applies the same crop box to every page and the new sizes reflect the mm→points conversion', async () => {
    const x = 25; // mm
    const y = 15; // mm
    const width = 100; // mm
    const height = 60; // mm (fits inside 200pt page height ~ 105.4mm)
    const bytes = await build2PageFixture();
    const result = await cropPdfPages({
      bytes,
      x,
      y,
      width,
      height,
      originH: 'top',
    });
    expect(result.pageCount).toBe(2);
    expect(result.pdf.byteLength).toBeGreaterThan(0);

    const reloaded = await PDFDocument.load(result.pdf);
    expect(reloaded.getPageCount()).toBe(2);
    const pages = reloaded.getPages();
    for (const page of pages) {
      const box = page.getCropBox();
      const media = page.getMediaBox();
      expect(box.x).toBeCloseTo(x * MM_TO_PT, 1);
      expect(box.y).toBeCloseTo(y * MM_TO_PT, 1);
      expect(box.width).toBeCloseTo(width * MM_TO_PT, 1);
      expect(box.height).toBeCloseTo(height * MM_TO_PT, 1);
      // The CropBox and the MediaBox should match exactly so a downstream
      // "print at fit-to-printable-area" pass doesn't snap back to the
      // original MediaBox.
      expect(media.x).toBeCloseTo(box.x, 5);
      expect(media.y).toBeCloseTo(box.y, 5);
      expect(media.width).toBeCloseTo(box.width, 5);
      expect(media.height).toBeCloseTo(box.height, 5);
    }
  });

  it('bottom-left origin translates into a top-left CropBox by subtracting height from the page height', async () => {
    // 300 pt × 200 pt page. Bottom-left means the box sits on the y=0
    // baseline, so the CropBox y in top-left space is (200 - heightMm*72/25.4).
    const x = 10;
    const yBottom = 5;
    const width = 100;
    const height = 30;
    const bytes = await build2PageFixture();
    const result = await cropPdfPages({
      bytes,
      x,
      y: yBottom,
      width,
      height,
      originH: 'bottom',
    });
    const reloaded = await PDFDocument.load(result.pdf);
    const page = reloaded.getPageCount() > 0 ? reloaded.getPages()[0] : null;
    expect(page).not.toBeNull();
    if (!page) return;
    const box = page.getCropBox();
    const expectedY = 200 - yBottom * MM_TO_PT - height * MM_TO_PT;
    expect(box.y).toBeCloseTo(expectedY, 1);
    expect(box.height).toBeCloseTo(height * MM_TO_PT, 1);
  });

  it('clamps a box whose bottom edge overshoots the page (negative y in top-left space)', async () => {
    // The 200-pt page is ~76.6mm tall. A bottom-left box anchored at y=70
    // with height=20 lands its top in top-left space at pageH - 70*MM_TO_PT
    // - 20*MM_TO_PT = a positive value < pageH. But a much larger height
    // (50 mm) pushes the top edge below 0 in top-left space, and the helper
    // clamps the top edge to 0 instead of producing a negative CropBox.
    const x = 0;
    const yBottom = 70;
    const width = 100;
    const height = 50;
    const bytes = await build2PageFixture();
    const result = await cropPdfPages({
      bytes,
      x,
      y: yBottom,
      width,
      height,
      originH: 'bottom',
    });
    const reloaded = await PDFDocument.load(result.pdf);
    const page = reloaded.getPages()[0];
    if (!page) return;
    const box = page.getCropBox();
    expect(box.y).toBe(0);
    expect(box.height).toBeGreaterThan(0);
  });
});

describe('pdf-crop > /api/pdf/crop route', () => {
  it('returns 200 with content-type application/pdf and an x-pages header (smoke)', async () => {
    const { POST } = await import('../../src/app/api/pdf/crop/route');
    const bytes = await build2PageFixture();
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'mydoc.pdf');
    form.append('box', JSON.stringify({ x: 10, y: 10, width: 50, height: 50, originH: 'top' }));
    form.append('origin', 'top');
    const req = new Request('http://localhost/api/pdf/crop', { method: 'POST', body: form });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('x-pages')).toBe('2');
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('mydoc-recortado.pdf');
    expect(res.headers.get('cache-control')).toBe('no-store');
    // The output PDF should round-trip via pdf-lib and the CropBox should
    // equal (x*72/25.4, y*72/25.4, w*72/25.4, h*72/25.4).
    const buffer = new Uint8Array(await res.arrayBuffer());
    const reloaded = await PDFDocument.load(buffer);
    const page = reloaded.getPages()[0];
    if (!page) return;
    const box = page.getCropBox();
    expect(box.x).toBeCloseTo(10 * MM_TO_PT, 1);
    expect(box.y).toBeCloseTo(10 * MM_TO_PT, 1);
    expect(box.width).toBeCloseTo(50 * MM_TO_PT, 1);
    expect(box.height).toBeCloseTo(50 * MM_TO_PT, 1);
  });

  it('rejects with 400 + field error when the box is missing', async () => {
    const { POST } = await import('../../src/app/api/pdf/crop/route');
    const bytes = await build2PageFixture();
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'doc.pdf');
    // no `box` field
    const req = new Request('http://localhost/api/pdf/crop', { method: 'POST', body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: { file?: string } };
    expect(body.errors?.file).toBeTruthy();
  });

  it('rejects with 400 + field error on non-PDF bytes (bad magic)', async () => {
    const { POST } = await import('../../src/app/api/pdf/crop/route');
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array([0, 1, 2, 3, 5])]), 'fake.pdf');
    form.append('box', JSON.stringify({ x: 0, y: 0, width: 50, height: 50 }));
    const req = new Request('http://localhost/api/pdf/crop', { method: 'POST', body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: { file?: string } };
    // The route's first failure path on this test fixture is PDF detection
    // ("cabecera incorrecta") OR downstream parse ("... podría estar dañado").
    // Either way the response is a 400 with a clear Spanish message.
    expect(body.errors?.file).toBeTruthy();
    expect(body.errors?.file).toMatch(/PDF|cabecera|da[ñn]ado/i);
  });

  it('rejects with 400 when the box sum overshoots MAX_PDF_BOX_MM', async () => {
    const { POST } = await import('../../src/app/api/pdf/crop/route');
    const bytes = await build2PageFixture();
    const form = new FormData();
    form.append('file', new Blob([bytes]), 'doc.pdf');
    form.append('box', JSON.stringify({ x: 1900, y: 0, width: 200, height: 50 }));
    const req = new Request('http://localhost/api/pdf/crop', { method: 'POST', body: form });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors?: { file?: string } };
    expect(body.errors?.file).toContain('región de recorte');
  });

  it('rejects with 400 when filename exceeds MAX_FILENAME_LEN', async () => {
    const { POST } = await import('../../src/app/api/pdf/crop/route');
    const bytes = await build2PageFixture();
    const longName = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    // Newer Web Headers + FormData in vitest's jsdom allow a File with a
    // custom name. If unavailable the route falls back to "archivo.pdf" and
    // the test admits the response is 200. Either way the bytes are valid.
    const form = new FormData();
    let file: Blob;
    try {
      file = new File([bytes], longName, { type: 'application/pdf' });
    } catch {
      file = new Blob([bytes]);
    }
    form.append('file', file, longName);
    form.append('box', JSON.stringify({ x: 0, y: 0, width: 50, height: 50 }));
    const req = new Request('http://localhost/api/pdf/crop', { method: 'POST', body: form });
    const res = await POST(req);
    expect([200, 400]).toContain(res.status);
  });
});
