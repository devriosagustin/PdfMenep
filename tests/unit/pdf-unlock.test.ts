import { PDFDocument } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { downloadNameForUnlock } from '../../src/lib/business/pdf-format';
import { PdfUnlockError, unlockPdf } from '../../src/lib/business/pdf-unlock';
import { PDF_MAGIC as PDF_MAGIC_FROM_CONVERT } from '../../src/lib/contracts/pdf-convert';
import {
  MAX_FILENAME_LEN,
  MAX_PAGES,
  MAX_PASSWORD_LEN,
  MAX_UNLOCK_BYTES,
  PDF_MAGIC,
  PdfUnlockFieldErrors,
  PdfUnlockInputMeta,
  PdfUnlockPassword,
  PdfUnlockServerError,
} from '../../src/lib/contracts/pdf-unlock';
import { friendlyUnlockError, type PdfUnlockErrorCode } from '../../src/lib/errors/friendly';

const SECRET = 'openme2026!';

async function buildEncryptedFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  doc.addPage([300, 200]);
  doc.encrypt({ userPassword: SECRET, ownerPassword: SECRET });
  const bytes = await doc.save({ useObjectStreams: true });
  return new Uint8Array(bytes);
}

async function buildOnePageFixture(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([300, 200]);
  const bytes = await doc.save({ useObjectStreams: false });
  return new Uint8Array(bytes);
}

describe('pdf-unlock contract', () => {
  it('exposes the expected cap values (drift guard)', () => {
    expect(MAX_UNLOCK_BYTES).toBe(60 * 1024 * 1024);
    expect(MAX_PAGES).toBe(100);
    expect(MAX_PASSWORD_LEN).toBe(64);
    expect(PDF_MAGIC).toBe('%PDF-');
    expect(MAX_FILENAME_LEN).toBe(200);
  });

  it('re-exports the same PDF_MAGIC value as pdf-convert (single source of truth)', () => {
    expect(PDF_MAGIC).toBe(PDF_MAGIC_FROM_CONVERT);
  });

  it('accepts a valid PdfUnlockInputMeta', () => {
    const result = PdfUnlockInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1024 });
    expect(result.success).toBe(true);
  });

  it('rejects a filename longer than MAX_FILENAME_LEN', () => {
    const long = `${'a'.repeat(MAX_FILENAME_LEN + 1)}.pdf`;
    const result = PdfUnlockInputMeta.safeParse({ filename: long, sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes larger than MAX_UNLOCK_BYTES', () => {
    const result = PdfUnlockInputMeta.safeParse({
      filename: 'big.pdf',
      sizeBytes: MAX_UNLOCK_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive or non-integer sizeBytes', () => {
    expect(PdfUnlockInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 0 }).success).toBe(false);
    expect(PdfUnlockInputMeta.safeParse({ filename: 'a.pdf', sizeBytes: 1.5 }).success).toBe(false);
  });

  it('rejects an empty filename', () => {
    const result = PdfUnlockInputMeta.safeParse({ filename: '', sizeBytes: 1024 });
    expect(result.success).toBe(false);
  });

  it('round-trips a field-errors body', () => {
    const result = PdfUnlockFieldErrors.safeParse({ errors: { file: 'bad' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.errors.file).toBe('bad');
  });

  it('round-trips a plain server-error body', () => {
    const result = PdfUnlockServerError.safeParse({ error: 'oops' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.error).toBe('oops');
  });

  it('PdfUnlockPassword accepts ANY non-empty value up to MAX_PASSWORD_LEN', () => {
    expect(PdfUnlockPassword.safeParse('a').success).toBe(true);
    expect(PdfUnlockPassword.safeParse('A'.repeat(64)).success).toBe(true);
    expect(PdfUnlockPassword.safeParse('A'.repeat(65)).success).toBe(false);
    expect(PdfUnlockPassword.safeParse('').success).toBe(false);
  });
});

describe('pdf-unlock > downloadNameForUnlock', () => {
  it('returns "unlocked.pdf" for empty filename', () => {
    expect(downloadNameForUnlock(null)).toBe('unlocked.pdf');
  });

  it('returns "doc-unlocked.pdf" for a bare "doc.pdf"', () => {
    expect(downloadNameForUnlock('doc.pdf')).toBe('doc-unlocked.pdf');
  });

  it('handles an already-tweaked name', () => {
    expect(downloadNameForUnlock('myfile.PDF')).toBe('myfile-unlocked.pdf');
  });
});

describe('friendlyUnlockError', () => {
  const codes: PdfUnlockErrorCode[] = [
    'read_form_failed',
    'no_file',
    'file_too_big',
    'filename_too_long',
    'invalid_pdf_meta',
    'bad_magic',
    'no_password',
    'password_too_long',
    'unlock_wrong_password',
    'unlock_pdf_not_encrypted',
    'unlock_encrypt_unlock_failed',
    'invalid_pdf_empty',
    'invalid_pdf_password',
    'invalid_pdf_corrupt',
    'unlock_failed',
    'timeout',
    'unexpected',
  ];

  it('returns a non-empty Spanish string for every error code', () => {
    for (const code of codes) {
      expect(typeof friendlyUnlockError(code)).toBe('string');
      expect(friendlyUnlockError(code).length).toBeGreaterThan(0);
    }
  });

  it('substitutes the filename into messages that name a file', () => {
    expect(friendlyUnlockError('file_too_big', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyUnlockError('bad_magic', { filename: 'doc.pdf' })).toContain('doc.pdf');
    expect(friendlyUnlockError('invalid_pdf_corrupt', { filename: 'doc.pdf' })).toContain(
      'doc.pdf',
    );
  });

  it('uses an unmistakable "incorrecta" wording for wrong-password errors', () => {
    expect(friendlyUnlockError('unlock_wrong_password')).toMatch(/incorrecta/i);
    expect(friendlyUnlockError('invalid_pdf_password')).toMatch(/incorrecta/i);
  });
});

describe('pdf-unlock > unlockPdf business module', () => {
  it('returns a password-free PDF when given a correct password against an encrypted source', async () => {
    const encrypted = await buildEncryptedFixture();
    const out = await unlockPdf({ bytes: encrypted, password: SECRET });
    expect(out.pageCount).toBe(2);
    const opened = await PDFDocument.load(out.pdf, { ignoreEncryption: false });
    expect(opened.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(opened.isEncrypted).toBe(false);
  });

  it('throws PdfUnlockError("invalid_pdf", "password") for a wrong password', async () => {
    const encrypted = await buildEncryptedFixture();
    let captured: PdfUnlockError | null = null;
    try {
      await unlockPdf({ bytes: encrypted, password: 'wrong-password' });
    } catch (err) {
      if (err instanceof PdfUnlockError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('password');
  });

  it('rejects empty/corrupt input via PdfUnlockError("invalid_pdf", "corrupt")', async () => {
    let captured: PdfUnlockError | null = null;
    try {
      await unlockPdf({ bytes: new Uint8Array([0, 1, 2, 3]), password: 'whatever' });
    } catch (err) {
      if (err instanceof PdfUnlockError) captured = err;
    }
    expect(captured).not.toBeNull();
    expect(captured?.code).toBe('invalid_pdf');
    expect(captured?.reason).toBe('corrupt');
  });

  it('handles a NON-encrypted PDF (loads, copies pages to a fresh doc, returns clear bytes)', async () => {
    const plain = await buildOnePageFixture();
    const out = await unlockPdf({ bytes: plain, password: 'whatever' });
    expect(out.pageCount).toBe(1);
    const opened = await PDFDocument.load(out.pdf, { ignoreEncryption: false });
    expect(opened.isEncrypted).toBe(false);
  });
});
