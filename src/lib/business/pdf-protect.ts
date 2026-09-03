import 'server-only';
import { PDFDocument } from '@cantoo/pdf-lib';

export class PdfProtectError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'protect_failed' | 'timeout',
    public readonly reason?: 'password' | 'corrupt' | 'empty',
  ) {
    super();
  }
}

export interface PdfProtectInput {
  bytes: Uint8Array;
  password: string;
}

export interface PdfProtectResult {
  pdf: Uint8Array;
  pageCount: number;
}

const PROTECT_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfProtectError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function protectPdf(input: PdfProtectInput): Promise<PdfProtectResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      // The source may already be encrypted (rare but legal). We are
      // applying a NEW password on top, so load with ignoreEncryption: true
      // — the caller doesn't need to know (or supply) the original
      // password; pdf-lib decrypts transparently without raising.
      src = await PDFDocument.load(input.bytes, { ignoreEncryption: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfProtectError('invalid_pdf', 'password');
      }
      throw new PdfProtectError('invalid_pdf', 'corrupt');
    }

    const pages = src.getPages();
    if (pages.length === 0) {
      throw new PdfProtectError('invalid_pdf', 'empty');
    }

    try {
      // `@cantoo/pdf-lib` exposes `PDFDocument#encrypt({ ... })`. Use both
      // userPassword and ownerPassword equal to the supplied password —
      // that's the iLovePDF-style "open + edit are both gated" semantic.
      src.encrypt({
        userPassword: input.password,
        ownerPassword: input.password,
      });
      const pdf = await src.save({ useObjectStreams: true });
      return { pdf, pageCount: pages.length };
    } catch (err) {
      if (err instanceof PdfProtectError) throw err;
      throw new PdfProtectError('protect_failed');
    }
  })();

  return raceTimeout(work, PROTECT_TIMEOUT_MS);
}
