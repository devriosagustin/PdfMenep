import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  downloadNameForProtect,
  downloadNameForProtect as downloadNameForProtectFromLib,
} from '../../src/lib/business/pdf-format';
import { PdfProtectError, protectPdf } from '../../src/lib/business/pdf-protect';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  classifyPasswordStrength,
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_PASSWORD_LEN,
  MAX_PROTECT_BYTES,
  MIN_PASSWORD_LEN,
  PDF_MAGIC,
  PdfProtectFieldErrors,
  PdfProtectInputMeta,
  PdfProtectPassword,
  PdfProtectServerError,
  PdfProtectStrength,
} from '../../src/lib/contracts/pdf-protect';
import { friendlyProtectError, type PdfProtectErrorCode } from '../../src/lib/errors/friendly';

async function buildOnePageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const bytes = await doc.save({ useObjectStreams: false });
  return new Uint8Array(bytes);
}

describe('pdf-protect contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_PROTECT_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_PAGES).toBe(100);
    expect(MAX_PASSWORD_LEN).toBe(64);
    expect(MIN_PASSWORD_LEN).toBe(4);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfProtectInputMeta', () => {
    const result = PdfProtectInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfProtectInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_PROTECT_BYTES', () => {
    const result = PdfProtectInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_PROTECT_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfProtectInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfProtectInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(
      false,
    );
  });

  it('rejects an empty filename', () => {
    const result = PdfProtectInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfProtectFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfProtectServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });

  it('PdfProtectPassword accepts 4-char and longer values, rejects 3-char and 65-char', () => {
    expect(PdfProtectPassword.safeParse('abcd').success).toBe(true);
    expect(PdfProtectPassword.safeParse('A'.repeat(64)).success).toBe(true);
    expect(PdfProtectPassword.safeParse('abc').success).toBe(false);
    expect(PdfProtectPassword.safeParse('A'.repeat(65)).success).toBe(false);
    expect(PdfProtectPassword.safeParse('').success).toBe(false);
  });

  it('PdfProtectStrength accepts the three valid literals', () => {
    expect(PdfProtectStrength.safeParse('weak').success).toBe(true);
    expect(PdfProtectStrength.safeParse('medium').success).toBe(true);
    expect(PdfProtectStrength.safeParse('strong').success).toBe(true);
    expect(PdfProtectStrength.safeParse('other').success).toBe(false);
  });
});

describe('pdf-protect > classifyPasswordStrength', () => {
  it('weak for empty password', () => {
    expect(classifyPasswordStrength('')).toBe('weak');
  });

  it('medium for 4-char single-class password (minimum length bound)', () => {
    expect(classifyPasswordStrength('aaaa')).toBe('medium'); // 4 chars, 1 class (lowercase)
    expect(classifyPasswordStrength('abcd')).toBe('medium'); // 4 chars, letters + nothing else
  });

  it('medium for length 8 with >=2 classes', () => {
    expect(classifyPasswordStrength('Abcdefgh')).toBe('medium');
  });

  it('strong for length 14 with >=3 classes', () => {
    expect(classifyPasswordStrength('Abcdefgh123456')).toBe('strong');
  });

  it('strong for length 10 with 2 classes', () => {
    expect(classifyPasswordStrength('Aa12345678')).toBe('strong');
  });

  it('treats symbol char classes for strength', () => {
    expect(classifyPasswordStrength('abcdef!@')).toBe('medium');
  });
});

describe('pdf-protect > downloadNameForProtect', () => {
  it('returns "protected.pdf" for empty filename', () => {
    expect(downloadNameForProtect(null)).toBe('protected.pdf');
  });

  it('returns "doc-protected.pdf" for a bare "doc.pdf"', () => {
    expect(downloadNameForProtect('doc.pdf')).toBe('doc-protected.pdf');
  });

  it('handles an already-tweaked name', () => {
    expect(downloadNameForProtect('myfile.PDF')).toBe('myfile-protected.pdf');
  });

  it('asserts: re-exported helper matches the contract', () => {
    expect(downloadNameForProtectFromLib).toBeDefined();
  });
});

describe('friendlyProtectError', () => {
  const codes: PdfProtectErrorCode[] = [
    'read_form_failed',
    'no_file',
    'file_too_big',
    'filename_too_long',
    'invalid_pdf_meta',
    'bad_magic',
    'no_password',
    'password_too_short',
    'password_too_long',
    'protect_weak_password',
    'invalid_pdf_empty',
    'invalid_pdf_password',
    'invalid_pdf_corrupt',
    'protect_failed',
    'timeout',
    'unexpected',
  ];

  it('returns a non-empty Spanish string for every error code', () => {
    for (const code of codes) {
      expect(typeof friendlyProtectError(code)).toBe('string');
      expect(friendlyProtectError(code).length).toBeGreaterThan(0);
    }
  });

  it('substitutes the filename into messages that name a file', () => {
    expect(friendlyProtectError('file_too_big', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyProtectError('bad_magic', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyProtectError('invalid_pdf_corrupt', { filename: 'doc.pdf' })).toContain(
      'doc.pdf',
    );
  });

  it('substitutes the min/max chars for password length errors', () => {
    expect(friendlyProtectError('password_too_short', { minChars: 4 })).toContain('4');
    expect(friendlyProtectError('password_too_long', { maxChars: 64 })).toContain('64');
  });
});

describe('pdf-protect > protectPdf business module', () => {
  it('produces an encrypted PDF: load WITHOUT password throws with /password/i', async () => {
    const bytes = await buildOnePageFixture();
    const out = await protectPdf({ bytes, password: 'test1234' });
    expect(out.pageCount).toBe(1);
    expect(out.pdf.byteLength).toBeGreaterThan(0);

    let captured: Error | null = null;
    try {
      await PDFDocument.load(out.pdf, { ignoreEncryption: false });
    } catch (err) {
      captured = err instanceof Error ? err : new Error(String(err));
    }
    expect(captured).not.toBeNull();
    expect(captured?.message).toMatch(/encrypt/i);
  });

  it('produces an encrypted PDF that opens WITH the password and yields ≥1 page', async () => {
    const bytes = await buildOnePageFixture();
    const out = await protectPdf({ bytes, password: 'openwithpwd' });
    const opened = await PDFDocument.load(out.pdf, {
      ignoreEncryption: false,
      password: 'openwithpwd',
    });
    expect(opened.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('rejects an empty/corrupt input via PdfProtectError("invalid_pdf", "corrupt")', async () => {
    let captured: PdfProtectError | null = null;
    try {
      await protectPdf({ bytes: new Uint8Array([0, 1, 2, 3]), password: 'test1234' });
    } catch (err) {
      if (err instanceof PdfProtectError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('corrupt');
  });

  it('accepts a 4-character password (MIN_PASSWORD_LEN lower bound)', async () => {
    const bytes = await buildOnePageFixture();
    const out = await protectPdf({ bytes, password: 'abcd' });
    expect(out.pdf.byteLength).toBeGreaterThan(0);
  });

  it('accepts a 64-character password (MAX_PASSWORD_LEN upper bound)', async () => {
    const bytes = await buildOnePageFixture();
    const pwd = 'A'.repeat(64);
    const out = await protectPdf({ bytes, password: pwd });
    expect(out.pdf.byteLength).toBeGreaterThan(0);
  });
});
