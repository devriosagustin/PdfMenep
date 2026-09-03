import 'server-only';
import { PDFDocument } from 'pdf-lib';

export class PdfMergeError extends Error {
  constructor(
    public readonly code: 'invalid_pdf' | 'copy_failed' | 'timeout',
    message: string,
    public readonly filename?: string,
    public readonly isPassword?: boolean,
  ) {
    super(message);
  }
}

export interface PdfMergeInput {
  filename: string;
  bytes: Uint8Array;
}

export interface PdfMergeResult {
  pdf: Uint8Array;
  pageCount: number;
}

const MERGE_TIMEOUT_MS = 30_000;

function raceTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfMergeError('timeout', `${what} tardó demasiado`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function mergePdfsToPdf(inputs: PdfMergeInput[]): Promise<PdfMergeResult> {
  const work = (async () => {
    const merged = await PDFDocument.create();
    let pageCount = 0;
    for (let i = 0; i < inputs.length; i++) {
      const input = inputs[i];
      if (!input) throw new PdfMergeError('invalid_pdf', 'Entrada no válida');
      let src: PDFDocument;
      try {
        src = await PDFDocument.load(input.bytes, { ignoreEncryption: false });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        if (/password/i.test(msg)) {
          throw new PdfMergeError(
            'invalid_pdf',
            `"${input.filename}" está protegido con contraseña`,
            input.filename,
            true,
          );
        }
        throw new PdfMergeError(
          'invalid_pdf',
          `"${input.filename}" no se pudo leer como PDF`,
          input.filename,
          false,
        );
      }
      try {
        const indices = src.getPageIndices();
        const pages = await merged.copyPages(src, indices);
        for (const page of pages) {
          merged.addPage(page);
        }
        pageCount += pages.length;
      } catch (err) {
        if (err instanceof PdfMergeError) throw err;
        throw new PdfMergeError(
          'copy_failed',
          `No se pudieron copiar las páginas de "${input.filename}"`,
          input.filename,
        );
      }
    }
    const bytes = await merged.save();
    return { pdf: bytes, pageCount };
  })();
  return raceTimeout(work, MERGE_TIMEOUT_MS, 'Fusión de PDFs');
}
