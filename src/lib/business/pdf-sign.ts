import 'server-only';
import { PDFDocument, StandardFonts } from 'pdf-lib';

import type { PdfSignSigner } from '@/lib/contracts/pdf-sign';

export class PdfSignError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'bad_signers' | 'sign_failed' | 'empty_doc' | 'timeout',
    public readonly reason?: 'password' | 'corrupt',
  ) {
    super();
  }
}

export interface PdfSignInput {
  bytes: Uint8Array;
  signers: ReadonlyArray<PdfSignSigner>;
  password?: string;
  signingDateToday?: string;
}

export interface PdfSignResult {
  pdf: Uint8Array;
  pageCount: number;
}

const SIGN_TIMEOUT_MS = 30_000;
const SIGN_MARGIN = 24;
const SIGN_LINE_BASE = 11;
const SIGN_BLOCK_GAP = 6;
const SIGN_STACK_STEP = 32;

// StandardFonts.Helvetica is WinAnsi-encoded; chars outside that map are
// dropped on save. Strip C0 control chars (U+0000–U+001F) so a stray NUL
// or tab doesn't cause pdf-lib to throw. The range is built from
// String.fromCharCode ranges at call time so the SOURCE carries no literal
// C0 control chars (which would trip biome's `noControlCharactersInRegex`).
function stripControlChars(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x00 && cp <= 0x1f) continue;
    out += ch;
  }
  return out.trim();
}

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfSignError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function sanitizeText(text: string): string {
  return stripControlChars(text);
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function drawSignerBlock(
  page: import('pdf-lib').PDFPage,
  font: import('pdf-lib').PDFFont,
  blockTopY: number,
  dateStr: string,
  signer: PdfSignSigner,
): void {
  const name = sanitizeText(signer.name);
  page.drawText(`Firmado por: ${name}`, {
    x: SIGN_MARGIN,
    y: blockTopY - SIGN_LINE_BASE,
    size: 9.5,
    font,
  });

  const meta: string[] = [];
  const reason = signer.reason?.trim() ?? '';
  if (reason.length > 0) meta.push(`Motivo: ${sanitizeText(reason)}`);
  const location = signer.location?.trim() ?? '';
  if (location.length > 0) meta.push(`Lugar: ${sanitizeText(location)}`);
  if (signer.signingDate ?? true) meta.push(`Fecha: ${dateStr}`);
  if (meta.length > 0) {
    page.drawText(meta.join(' | '), {
      x: SIGN_MARGIN,
      y: blockTopY - SIGN_LINE_BASE * 2 - SIGN_BLOCK_GAP,
      size: 8,
      font,
    });
  }
}

export async function signPdf(input: PdfSignInput): Promise<PdfSignResult> {
  return raceTimeout(work(input), SIGN_TIMEOUT_MS);
}

async function work(input: PdfSignInput): Promise<PdfSignResult> {
  if (input.signers.length === 0) {
    throw new PdfSignError('bad_signers');
  }

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(input.bytes, {
      ignoreEncryption: true,
      throwOnInvalidObject: false,
      ...(input.password && input.password.length > 0 ? { password: input.password } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/password/i.test(msg)) {
      throw new PdfSignError('invalid_pdf', 'password');
    }
    throw new PdfSignError('invalid_pdf', 'corrupt');
  }

  const pages = src.getPages();
  if (pages.length === 0) {
    throw new PdfSignError('empty_doc');
  }

  try {
    const font = await src.embedFont(StandardFonts.Helvetica);
    const dateStr = input.signingDateToday ?? todayIso();

    for (const page of pages) {
      const { height } = page.getSize();
      // Block lives at the bottom-left margin, one block per signer, stacked
      // upward. The block top is just above the page bottom margin so the
      // stamp is visible on print without overlapping footer-ish text. The
      // first signer is anchored at the bottom; subsequent signers stack
      // ABOVE it (lower y on the page = higher numerically for drawText).
      let blockTopY = SIGN_MARGIN + SIGN_LINE_BASE + (input.signers.length - 1) * SIGN_STACK_STEP;
      // Cap blockTopY so the stamp never reaches the top half of the page —
      // at most (~3.5 * SIGN_LINE_BASE) lines on a landscape sheet.
      const maxTopY = height - SIGN_MARGIN - SIGN_LINE_BASE * 3;
      if (blockTopY > maxTopY) blockTopY = maxTopY;
      for (const signer of input.signers) {
        drawSignerBlock(page, font, blockTopY, dateStr, signer);
        blockTopY -= SIGN_STACK_STEP;
      }
    }

    const pdf = await src.save();
    return { pdf, pageCount: pages.length };
  } catch (err) {
    if (err instanceof PdfSignError) throw err;
    throw new PdfSignError('sign_failed');
  }
}
