import 'server-only';
import { createRequire } from 'node:module';

import { type Canvas, createCanvas, type SKRSContext2D } from '@napi-rs/canvas';

import { MAX_PAGES } from '@/lib/contracts/pdf-convert';

interface PdfViewport {
  width: number;
  height: number;
}
interface PdfPageLike {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: Record<string, unknown>) => { promise: Promise<void> };
  cleanup: () => void;
}
interface PdfDocLike {
  numPages: number;
  getPage: (n: number) => Promise<PdfPageLike>;
  destroy: () => Promise<void>;
}
interface PdfPdfjsLike {
  getDocument: (params: Record<string, unknown>) => { promise: Promise<PdfDocLike> };
}

const pdfjsLib = createRequire(import.meta.url)('pdfjs-dist/legacy/build/pdf.mjs') as PdfPdfjsLike;

export class PdfRasterError extends Error {
  constructor(
    public readonly code:
      | 'invalid_pdf'
      | 'encrypted_pdf'
      | 'empty_pdf'
      | 'too_many_pages'
      | 'render_failed'
      | 'timeout',
    message: string,
  ) {
    super(message);
  }
}

interface CanvasAndContext {
  canvas: Canvas;
  context: SKRSContext2D;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    if (width <= 0 || height <= 0) {
      throw new PdfRasterError('invalid_pdf', 'Página con tamaño no válido');
    }
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext: CanvasAndContext, width: number, height: number): void {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: CanvasAndContext): void {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

export interface RasterPage {
  index: number;
  jpeg: Buffer;
  width: number;
  height: number;
}

export interface RasterResult {
  pages: RasterPage[];
}

const PAGE_RENDER_TIMEOUT_MS = 8_000;
const LOAD_TIMEOUT_MS = 5_000;
const TARGET_WIDTH = 1600;

function raceTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new PdfRasterError('timeout', `${what} tardó demasiado`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

const PDF_HEADER = Buffer.from('%PDF-');
function checkMagic(bytes: Uint8Array): void {
  if (bytes.byteLength < PDF_HEADER.length) {
    throw new PdfRasterError('invalid_pdf', 'El archivo está vacío o incompleto');
  }
  for (let i = 0; i < PDF_HEADER.length; i++) {
    if (bytes[i] !== PDF_HEADER[i]) {
      throw new PdfRasterError('invalid_pdf', 'El archivo no parece un PDF válido');
    }
  }
}

export async function rasterizePdfToJpeg(
  buffer: Uint8Array,
  options: { maxPages?: number } = {},
): Promise<RasterResult> {
  checkMagic(buffer);
  const maxPages = options.maxPages ?? MAX_PAGES;
  const factory = new NodeCanvasFactory();

  const loadingTask = pdfjsLib.getDocument({
    data: buffer,
    disableFontFace: true,
    useSystemFonts: false,
    disableAutoFetch: true,
    disableStream: true,
    isEvalSupported: false,
    canvasFactory: factory,
  });
  let doc: PdfDocLike;
  try {
    doc = await raceTimeout(loadingTask.promise, LOAD_TIMEOUT_MS, 'Lectura del PDF');
  } catch (err) {
    if (err instanceof PdfRasterError && err.code === 'timeout') throw err;
    throw new PdfRasterError('invalid_pdf', 'El archivo no se pudo leer como PDF');
  }

  const destroyDoc = async () => {
    try {
      await doc.destroy();
    } catch {
      // ignore — pdfjs's destroy() can throw on already-torn-down docs
    }
  };

  const totalPages = doc.numPages;
  if (totalPages < 1) {
    await destroyDoc();
    throw new PdfRasterError('empty_pdf', 'El PDF no contiene páginas');
  }
  if (totalPages > maxPages) {
    await destroyDoc();
    throw new PdfRasterError(
      'too_many_pages',
      `El PDF tiene ${totalPages} páginas; el máximo permitido es ${maxPages}`,
    );
  }

  const pages: RasterPage[] = [];
  try {
    for (let i = 1; i <= totalPages; i++) {
      const page = await doc.getPage(i);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(3, Math.max(1, TARGET_WIDTH / baseViewport.width));
      const viewport = page.getViewport({ scale });
      const { canvas } = factory.create(viewport.width, viewport.height);
      const cctx = canvas.getContext('2d');
      cctx.fillStyle = '#ffffff';
      cctx.fillRect(0, 0, viewport.width, viewport.height);
      await raceTimeout(
        page.render({
          canvasContext: cctx,
          viewport,
          canvasFactory: factory,
        } as unknown as Parameters<PdfPageLike['render']>[0]).promise,
        PAGE_RENDER_TIMEOUT_MS,
        `Renderizado de la página ${i}`,
      );
      const jpeg = canvas.toBuffer('image/jpeg', 0.88);
      pages.push({
        index: i,
        jpeg,
        width: viewport.width,
        height: viewport.height,
      });
      page.cleanup();
    }
  } catch (err) {
    if (err instanceof PdfRasterError) throw err;
    const msg = err instanceof Error ? err.message : '';
    if (/password/i.test(msg)) {
      throw new PdfRasterError('encrypted_pdf', 'El PDF está protegido con contraseña');
    }
    throw new PdfRasterError('render_failed', 'No se pudo renderizar una página del PDF');
  } finally {
    await destroyDoc();
  }
  return { pages };
}
