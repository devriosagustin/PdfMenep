import { describe, expect, it } from 'vitest';

import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_OCR_BYTES,
  MAX_OCR_PAGES,
  PDF_MAGIC,
  PdfOcrFieldErrors,
  PdfOcrInputMeta,
  PdfOcrLanguage,
  PdfOcrServerError,
} from '../../src/lib/contracts/pdf-ocr';
import { friendlyOcrError } from '../../src/lib/errors/friendly';

describe('pdf-ocr contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_OCR_BYTES).toBe(180 * 1024 * 1024); // PRO ceiling (FREE 60 MB x3)
    expect(MAX_OCR_PAGES).toBe(30);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('OCR byte cap is independent of pdf-convert MAX_UPLOAD_BYTES (20 MB) so 60 MB PDFs pass', () => {
    // Drift guard: the OCR endpoint deliberately diverges from
    // pdf-convert's 20 MB upload cap. If this assertion fires the dev
    // should re-confirm the size policy in the contract before touching
    // the constant.
    expect(MAX_OCR_BYTES).toBeGreaterThan(20 * 1024 * 1024);
  });

  it('accepts a valid PdfOcrInputMeta', () => {
    const result = PdfOcrInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfOcrInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_OCR_BYTES', () => {
    const result = PdfOcrInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_OCR_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfOcrInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfOcrInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: -1 }).success).toBe(false);
    expect(PdfOcrInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfOcrInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfOcrFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfOcrServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });
});

describe('pdf-ocr > PdfOcrLanguage enum', () => {
  it('accepts es and en', () => {
    expect(PdfOcrLanguage.safeParse('es').success).toBe(true);
    expect(PdfOcrLanguage.safeParse('en').success).toBe(true);
  });

  it('rejects every other value', () => {
    expect(PdfOcrLanguage.safeParse('fr').success).toBe(false);
    expect(PdfOcrLanguage.safeParse('ES').success).toBe(false);
    expect(PdfOcrLanguage.safeParse('').success).toBe(false);
    expect(PdfOcrLanguage.safeParse(null).success).toBe(false);
    expect(PdfOcrLanguage.safeParse(undefined).success).toBe(false);
  });
});

describe('friendlyOcrError', () => {
  it('read_form_failed → "No se pudo leer el formulario"', () => {
    expect(friendlyOcrError('read_form_failed')).toBe('No se pudo leer el formulario');
  });

  it('no_file → "Sube un archivo PDF en el campo "file""', () => {
    expect(friendlyOcrError('no_file')).toBe('Sube un archivo PDF en el campo "file"');
  });

  it('file_too_big byte-locked with filename and 60 MB cap', () => {
    expect(friendlyOcrError('file_too_big', { filename: 'informe.pdf', mb: 60 })).toBe(
      'El PDF "informe.pdf" supera 60 MB',
    );
  });

  it('file_too_big byte-locked without filename', () => {
    expect(friendlyOcrError('file_too_big', { mb: 60 })).toBe('El PDF supera 60 MB');
  });

  it('filename_too_long byte-locked', () => {
    expect(friendlyOcrError('filename_too_long', { filename: 'largo.pdf' })).toBe(
      'El nombre de "largo.pdf" es demasiado largo',
    );
  });

  it('invalid_pdf_meta byte-locked with filename context', () => {
    expect(friendlyOcrError('invalid_pdf_meta', { filename: 'a.pdf' })).toBe(
      'El PDF "a.pdf" no es válido',
    );
  });

  it('bad_magic byte-locked with and without filename context', () => {
    expect(friendlyOcrError('bad_magic', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no es un PDF válido (cabecera incorrecta)',
    );
    expect(friendlyOcrError('bad_magic')).toBe(
      'El archivo no es un PDF válido (cabecera incorrecta)',
    );
  });

  it('no_language → "Selecciona el idioma del texto (Español o Inglés)"', () => {
    expect(friendlyOcrError('no_language')).toBe(
      'Selecciona el idioma del texto (Español o Inglés)',
    );
  });

  it('invalid_language → Spanish hint copy', () => {
    expect(friendlyOcrError('invalid_language')).toBe('Idioma no válido. Usa "Español" o "Inglés"');
  });

  it('invalid_pdf_password byte-locked with OCR-specific suffix', () => {
    expect(friendlyOcrError('invalid_pdf_password')).toBe(
      'El PDF está protegido con contraseña. Quita la contraseña antes de reconocerlo',
    );
  });

  it('invalid_pdf_empty byte-locked', () => {
    expect(friendlyOcrError('invalid_pdf_empty')).toBe('El PDF no tiene páginas');
  });

  it('invalid_pdf_corrupt byte-locked with filename', () => {
    expect(friendlyOcrError('invalid_pdf_corrupt', { filename: 'a.pdf' })).toBe(
      '"a.pdf" no se pudo leer como PDF — el archivo podría estar dañado',
    );
  });

  it('ocr_failed byte-locked', () => {
    expect(friendlyOcrError('ocr_failed')).toBe(
      'No se pudo reconocer el texto del PDF. Inténtalo de nuevo con otro archivo',
    );
  });

  it('timeout byte-locked', () => {
    expect(friendlyOcrError('timeout')).toBe('Reconocimiento OCR del PDF tardó demasiado');
  });

  it('unexpected byte-locked', () => {
    expect(friendlyOcrError('unexpected')).toBe('No se pudo reconocer el texto del PDF');
  });
});
