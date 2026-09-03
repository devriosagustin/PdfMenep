import 'server-only';
import { PDFDocument } from '@cantoo/pdf-lib';

export class PdfUnlockError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'unlock_failed' | 'timeout',
    public readonly reason?: 'password' | 'not_encrypted' | 'corrupt' | 'empty',
  ) {
    super();
  }
}

export interface PdfUnlockInput {
  bytes: Uint8Array;
  password: string;
}

export interface PdfUnlockResult {
  pdf: Uint8Array;
  pageCount: number;
}

const UNLOCK_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfUnlockError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function unlockPdf(input: PdfUnlockInput): Promise<PdfUnlockResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      // Load WITH the supplied password so a wrong password surfaces here
      // — pdf-lib raises a "/password/i" error which we map to
      // invalid_pdf_password. A NON-encrypted PDF loads cleanly even with
      // a bogus password; we cannot and do not "succeed" by enforcing
      // encryption-state at load.
      src = await PDFDocument.load(input.bytes, {
        ignoreEncryption: false,
        password: input.password,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfUnlockError('invalid_pdf', 'password');
      }
      // Generic load failure
      throw new PdfUnlockError('invalid_pdf', 'corrupt');
    }

    if (src.getPages().length === 0) {
      throw new PdfUnlockError('invalid_pdf', 'empty');
    }

    try {
      // Verified approach: copy pages into a FRESH PDFDocument. The fresh
      // doc has no Encrypt entry in its trailerInfo, so saving it produces
      // a verifiable password-free PDF. A direct `src.save()` on the
      // loaded-encrypted doc still writes the source's trailer (including
      // /Encrypt), making the result still require the password — that's
      // why we re-shell into a new doc.
      const fresh = await PDFDocument.create();
      const indices = src.getPageIndices();
      const copied = await fresh.copyPages(src, indices);
      for (const page of copied) fresh.addPage(page);
      const pdf = await fresh.save({ useObjectStreams: true });
      return { pdf, pageCount: copied.length };
    } catch (err) {
      if (err instanceof PdfUnlockError) throw err;
      throw new PdfUnlockError('unlock_failed');
    }
  })();

  return raceTimeout(work, UNLOCK_TIMEOUT_MS);
}
