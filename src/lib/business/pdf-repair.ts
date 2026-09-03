import 'server-only';
import { PDFDocument } from 'pdf-lib';

export class PdfRepairError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'repair_failed' | 'timeout' | 'empty_doc',
    public readonly reason?: 'password' | 'corrupt',
  ) {
    super();
  }
}

export interface PdfRepairInput {
  bytes: Uint8Array;
  password?: string;
}

export interface PdfRepairResult {
  pdf: Uint8Array;
  pageCount: number;
}

const REPAIR_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfRepairError('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function repairPdf(input: PdfRepairInput): Promise<PdfRepairResult> {
  const work = (async () => {
    let src: PDFDocument;
    try {
      // Optional password is passed to pdf-lib only when supplied AND
      // non-empty so a non-encrypted PDF survives the load with no
      // argument at all. The "relaxed" flags let a PARTIAL parse succeed
      // for a corrupted PDF — that's the entire point of /reparar-pdf.
      src = await PDFDocument.load(input.bytes, {
        ignoreEncryption: true,
        throwOnInvalidObject: false,
        ...(input.password && input.password.length > 0 ? { password: input.password } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/password/i.test(msg)) {
        throw new PdfRepairError('invalid_pdf', 'password');
      }
      throw new PdfRepairError('invalid_pdf', 'corrupt');
    }

    if (src.getPages().length === 0) {
      throw new PdfRepairError('empty_doc');
    }

    try {
      // Fresh shell + copyPages preserves the source's content streams,
      // fonts, and cross-references inside the recovered draft. We don't
      // need useObjectStreams because the rebuild already discards
      // corrupt unused-object entries from the source trailer.
      const fresh = await PDFDocument.create();
      const indices = src.getPageIndices();
      const copied = await fresh.copyPages(src, indices);
      for (const page of copied) fresh.addPage(page);
      const pdf = await fresh.save();
      return { pdf, pageCount: copied.length };
    } catch (err) {
      if (err instanceof PdfRepairError) throw err;
      throw new PdfRepairError('repair_failed');
    }
  })();

  return raceTimeout(work, REPAIR_TIMEOUT_MS);
}
